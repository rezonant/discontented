import { CfStore, CfType, CfEntry, CfLink, CfTypeField, CfLocalizedValue, Context } from "./common";

export class BatchImporter {
    constructor(
        readonly context : Context,
        readonly source : CfStore
    ) {
        this.entryImporter = new EntryImporter(context, source);
    }

    entryImporter : EntryImporter;

    data : Map<string, RowUpdate[]>;

    addRows(tableName, rowsToAdd : RowUpdate[]) {
        let rows : RowUpdate[];
        if (!this.data.has(tableName)) {
            rows = [];
            this.data.set(tableName, rows);
        } else {
            rows = this.data.get(tableName);
        }

        rows.push(...rowsToAdd);
    }

    private generateForEntry(entry : CfEntry) {
        this.entryImporter.generateData(entry);

        for (let tableName of this.entryImporter.data.keys()) 
            this.addRows(tableName, this.entryImporter.data.get(tableName));
    }

    generateBatchSql(entries : CfEntry[] = null) {
        if (!entries)
            entries = this.source.entries;

        let sql : string[] = [];

        this.data = new Map<string, RowUpdate[]>();

        for (let entry of entries)
            this.generateForEntry(entry);
        
        for (let tableName of this.data.keys()) {
            let rows = this.data.get(tableName);
            if (rows.length === 0)
                continue;

            let pageSize = 100; // PRODUCTION: 1000
            let pagesRequired = Math.ceil(rows.length / pageSize);
            let exemplarRow = rows[0];
            let keys = Array.from(exemplarRow.data.keys());
            
            for (let page = 0; page < pagesRequired; ++page) {
                let offset = page * pageSize;
                let rowsSubset = rows.slice(offset, offset + pageSize);

                sql.push(
                    `\n`
                    + `-- *********************************************\n`
                    + `-- *\n` 
                    + `-- * ${tableName} [Page ${page + 1} / ${pagesRequired}, Total: ${rows.length}] \n` 
                    + `-- *\n` 
                    + `-- **\n` 
                    + `INSERT INTO ${tableName} (${keys.map(key => `"${key}"`).join(', ')})\n`
                    + `  VALUES ${rowsSubset.map(row => `(\n`
                    + `    ${Array.from(row.data.entries()).map(([ key, value ]) => this.context.serializeValue(value)).join(`,\n    `)}\n`
                    + `  )`)}`
                    + `\n`
                    + `  ON CONFLICT (${exemplarRow.uniqueKey})\n`
                    + `  DO\n` 
                    + (exemplarRow.onConflict === 'update' ?
                      `    UPDATE SET\n`
                    + `    ${keys
                                .filter(x => x !== 'cfid')
                                .map(key => `"${key}" = EXCLUDED."${key}"`)
                                .join(`,\n    `)}\n`
                    : `    NOTHING`
                    )
                );

            }

        }

        return sql;
    }
}

export interface RowUpdate {
    onConflict : 'update' | 'nothing';
    data : Map<string, any>;
    uniqueKey : string;
}

export class EntryImporter {
    constructor(
        readonly context : Context,
        readonly schema : CfStore
    ) {
    }

    data : Map<string, RowUpdate[]>;

    addRow(tableName : string, row : RowUpdate) {
        let rows : RowUpdate[];
        if (!this.data.has(tableName)) {
            rows = [];
            this.data.set(tableName, rows);
        } else {
            rows = this.data.get(tableName);
        }

        rows.push(row);
    }

    generateData(entry : CfEntry) {
        this.data = new Map<string, RowUpdate[]>();

        // generate sql-data

        let rowData = new Map<string, any>();

        for (let fieldId of Object.keys(entry.fields)) {
            let field = entry.fields[fieldId];
            let contentType = this.schema.contentTypes.find(x => x.sys.id === entry.sys.contentType.sys.id);
            let fieldDefinition = contentType.fields.find(x => x.id === fieldId);

            if (!fieldDefinition) {
                throw new Error(`Failed to find field ${fieldId} in content type ${contentType.sys.id}`);
            }
            let isArray = false;
            let fieldType = fieldDefinition.type;
            
            if (fieldDefinition.type === 'Array') {
                isArray = true;
                fieldType = fieldDefinition.items.type;
            }

            let columnName = this.context.getColumnNameForFieldId(fieldId);

            if (fieldType === 'Link') {
                if (fieldDefinition.localized || field['en-US']) {
                    let localizedField = <CfLocalizedValue>field;
                    field = localizedField[this.context.defaultLocalization];
                }

                if (isArray) {
                    let array = <CfLink[]>field;

                    for (let link of array) {
                        let linkRowData = new Map<string, any>();
                        linkRowData.set('owner_cfid', entry.sys.id);
                        linkRowData.set('item_cfid', link.sys.id);

                        this.addRow(
                            `${this.context.getTableNameForEntry(entry)}_${this.context.transformIdentifier(fieldDefinition.id)}`, 
                            { onConflict: 'nothing', uniqueKey: 'item_cfid', data: linkRowData }
                        );
                    }
                } else {
                    let link = <CfLink>field;

                    columnName = `${columnName}_cfid`;

                    if (!link.sys) {
                        console.log(JSON.stringify(link));
                        console.log(JSON.stringify(fieldDefinition));

                        throw new Error('bad');
                        
                    }
                    rowData.set(columnName, link.sys.id);
                }
            } else {
                let rawValue : any = field;

                if (fieldDefinition.localized || this.context.defaultLocalization in field) {
                    let localizedField = <CfLocalizedValue>field;
                    rawValue = localizedField[this.context.defaultLocalization];
                }

                rowData.set(columnName, rawValue);
            }
        }

        this.addRow(this.context.getTableNameForEntry(entry), {
            onConflict: 'update',
            uniqueKey: 'cfid',
            data: rowData
        });

    }
}

export class SchemaMigrator {
    constructor(
        readonly context : Context, 
        readonly schema : CfStore
    ) {
    }
    
    private createTableForType(contentType : CfType) {
        let tables = [];
        let columnDefinitions = [];

        // Determine the table name

        let tableName = this.context.getTableNameForTypeId(contentType.sys.id);
        
        // Push attributes that are common to all Contentful entries

        columnDefinitions.push(`"id" BIGSERIAL PRIMARY KEY`);
        columnDefinitions.push(`"cfid" VARCHAR(64) UNIQUE`);
        columnDefinitions.push(`"created_at" VARCHAR(64)`);
        columnDefinitions.push(`"updated_at" VARCHAR(64)`);
        columnDefinitions.push(`"published_at" VARCHAR(64)`);

        // Construct column definitions (and optionally subtables)

        for (let field of contentType.fields) {
            let columnName = this.context.getColumnNameForFieldId(field.id);
            let dataType = 'unknown';
            let isArray = false;
            let fieldType = field.type;

            if (field.type === 'Array') {
                isArray = true;
                fieldType = field.items.type;
            }
            
            let skipColumn = false;

            if (fieldType === 'Link') {
                let linkType = field.linkType;

                if (field.type === 'Array') {
                    isArray = true;
                    linkType = field.items.linkType;
                }

                if (isArray) {
                    let linkTableName = `${tableName}_${this.context.transformIdentifier(field.id)}`
                    tables.push(
                          `CREATE TABLE ${linkTableName} (\n`
                        + `    "owner_cfid" VARCHAR(64),\n`
                        + `    "item_cfid" VARCHAR(64) UNIQUE\n`
                        + `)`
                    );
                    skipColumn = true;
                } else {
                    if (linkType === 'Asset') {
                        columnName = `${columnName}_cfurl`;
                        dataType = 'VARCHAR(1024)';
                    } else if (linkType === 'Entry') {
                        columnName = `${columnName}_cfid`;
                        dataType = 'VARCHAR(64)';
                    } else {
                        throw new Error(`Encountered invalid Contentful Link type ${field.linkType}`);
                    }
                }
            } else {
                let simpleTypes = {
                    Boolean: 'BOOLEAN',
                    Integer: 'BIGINT',
                    Number: 'REAL',
                    Date: 'TIMESTAMP',
                    Symbol: 'VARCHAR(256)',
                    Text: 'TEXT',
                    Location: 'JSONB',
                    Object: 'JSONB'
                };

                dataType = simpleTypes[fieldType];

                if (!dataType)
                    dataType = `UNKNOWN[${fieldType}]`;

                if (isArray) {
                    // this is a simple array
                    dataType += '[]';
                }
            }

            if (!skipColumn)
                columnDefinitions.push(`"${columnName}" ${dataType}`);
        }

        columnDefinitions.push(`"raw" JSONB`);

        tables.push(
              `CREATE TABLE ${tableName} (\n` 
            + `    ${columnDefinitions.join(`,\n    `)}\n`
            + `)`
        );

        return tables.join("\n\n");
    }

    createSchema() {
        let sql = '';

        for (let contentType of this.schema.contentTypes) {
            sql += `\n`;
            sql += `-- *************************************************************\n`
            sql += `-- *\n`
            sql += `-- * CONTENT TYPE: ${contentType.name} [${contentType.sys.id}]\n`;
            sql += `-- *\n`
            sql += `-- **\n`
            sql += `\n`;
            sql += this.createTableForType(contentType);
            sql += `\n`;
        }

        return sql;
    }
}
