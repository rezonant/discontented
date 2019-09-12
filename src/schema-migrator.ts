import { CfStore, CfType, CfEntry, CfLink, CfTypeField, CfLocalizedValue } from "./contentful";
import * as changeCase from 'change-case';
import { stringify } from "querystring";

export interface ColumnMapOptions {
    name? : string;
    sqlType? : string;
}

export interface ColumnMap {
    [ fieldId : string ] : string | ColumnMapOptions;
}

export interface TableMapOptions {
    name? : string;
    columnMap? : ColumnMap;
}

export interface TableMap {
    [ typeId : string ] : string | TableMapOptions;
}

export interface Options {
    tablePrefix? : string;
    tableMap? : TableMap;
    defaultLocalization? : string;

    transformIdentifier? : (id : string) => string;
    deriveTableNameFromContentfulType? : (id : string) => string;
    pluralize? : (id : string) => string;
}

export interface CfSpaceCredentials {
    spaceId: string;
    managementToken: string;
}

export class Context {
    constructor(
        readonly definition : Options = {}
    ) {
    }

    private _credentials : CfSpaceCredentials;

    get defaultLocalization() {
        return this.definition.defaultLocalization || 'en-US';
    }

    get tablePrefix() {
        return this.definition.tablePrefix;
    }

    setCredentials(creds : CfSpaceCredentials) {
        this._credentials = creds;
    }

    toJSON() {
        let shallowClone = Object.assign({}, this);

        delete shallowClone._credentials;
    }

    get credentials() {
        return this._credentials;
    }

    pluralize(name : string) {
        if (this.definition.pluralize)
            return this.definition.pluralize(name);

        if (name.endsWith('s'))
            return name + 'es';
        return name + 's';
    }

    getColumnNameForFieldId(identifier : string) {
        return this.transformIdentifier(identifier);
    }

    getColumnNameForField(field : CfTypeField) {
        return this.getColumnNameForFieldId(field.id);
    }

    transformIdentifier(identifier : string) {
        if (this.definition.transformIdentifier)
            return this.definition.transformIdentifier(identifier);
        
        return changeCase.snake(identifier);
    }
    
    getTableNameForEntry(entry : CfEntry) {
        return this.getTableNameForTypeId(entry.sys.contentType.sys.id);
    }

    getTableNameForType(entry : CfType) {
        return this.getTableNameForTypeId(entry.sys.id);
    }

    getTableNameForTypeId(cfContentTypeId : string) {
        if (this.definition.deriveTableNameFromContentfulType)
            return this.definition.deriveTableNameFromContentfulType(cfContentTypeId);

        let tableName : string;

        let mapEntry = this.definition.tableMap[cfContentTypeId];
        if (mapEntry)
            tableName = typeof mapEntry === 'string' ? mapEntry : mapEntry.name;

        if (!tableName) {
            if (this.definition.deriveTableNameFromContentfulType)
                tableName = this.definition.deriveTableNameFromContentfulType(cfContentTypeId);
            else
                tableName = this.pluralize(this.transformIdentifier(cfContentTypeId));
        }

        tableName = `${this.tablePrefix}${tableName}`;

        return tableName;
    }
}

export class BatchImporter {
    constructor(
        readonly context : Context,
        readonly source : CfStore
    ) {
    }

    generateBatchSql() {

        // Sort the entries into buckets by type 

        let entriesByType = new Map<string, CfEntry[]>();
        for (let entry of this.source.entries) {
            let typeEntries : CfEntry[];
            let contentTypeId = entry.sys.contentType.sys.id;

            if (entriesByType.has(contentTypeId)) {
                typeEntries = entriesByType.get(contentTypeId);
            } else {
                typeEntries = [];
                entriesByType.set(contentTypeId, typeEntries);
            }

            typeEntries.push(entry);
        }

        let importer = new EntryImporter(this.context, this.source);
        let sql : string[] = [];

        for (let [ typeId, entries ] of entriesByType.entries()) {
            for (let entry of entries) {
                sql.push(...importer.generateUpsertSql(entry));
            }
        }

        return sql;
    }
}

export class EntryImporter {
    constructor(
        readonly context : Context,
        readonly schema : CfStore
    ) {
    }

    serializeValue(value : any, quoteChar = `'`) : string {
        if (typeof value === 'string') {
            return `${quoteChar}${value.replace(
                            new RegExp(quoteChar, 'g'), `${quoteChar}${quoteChar}`
                        )}${quoteChar}`;
        } else if (typeof value === 'number') {
            return `${value}`;
        } else if (typeof value === 'boolean') {
            return value ? 'true' : 'false';
        } else if (value instanceof Date) {
            return value.toISOString();
        } else if (value instanceof Array || value.length !== undefined) {
            let array = Array.from(<any[]>value);

            return this.serializeValue(`{${array.map(x => this.serializeValue(x, `"`)).join(', ')}}`);
        } else {
            throw new Error(`Could not serialize value: ${JSON.stringify(value)}`);
        }
    }

    generateUpsertSql(entry : CfEntry) {
        let tableName = this.context.getTableNameForEntry(entry);
        let sqlStatements = [];

        let sqlData = new Map<string, string | number>();

        // generate sql-data

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
                        sqlStatements.push(
                              `-- *********************************************\n`
                            + `-- *\n` 
                            + `-- * LINK ${entry.sys.id} [type=${entry.sys.contentType.sys.id}] -> ${fieldDefinition.id} -> ${link.sys.id}\n` 
                            + `-- *\n` 
                            + `-- **\n` 
                            + `INSERT INTO ${tableName} (owner_cfid, item_cfid)\n`
                            + `VALUES (\n`
                            + `    ${entry.sys.id},\n`
                            + `    ${this.serializeValue(link.sys.id)}\n`
                            + `)\n`
                            + `  ON CONFLICT (item_cfid)\n`
                            + `  DO NOTHING`
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
                    sqlData.set(columnName, link.sys.id);
                }
            } else {
                let rawValue : any = field;

                if (fieldDefinition.localized || this.context.defaultLocalization in field) {
                    let localizedField = <CfLocalizedValue>field;
                    rawValue = localizedField[this.context.defaultLocalization];
                }

                sqlData.set(columnName, rawValue);
            }
        }

        let keys = Array.from(sqlData.keys());

        sqlStatements.push(
              `\n`
            + `-- *********************************************\n`
            + `-- *\n` 
            + `-- * ENTRY ${entry.sys.id} [type=${entry.sys.contentType.sys.id}]\n` 
            + `-- *\n` 
            + `-- **\n` 
            + `INSERT INTO ${tableName} (${keys.map(key => `"${key}"`).join(', ')})\n`
            + `  VALUES (\n`
            + `    ${keys.map(key => this.serializeValue(sqlData.get(key))).join(`,\n    `)}\n`
            + `  )\n`
            + `  ON CONFLICT (cfid)\n`
            + `  DO UPDATE SET\n`
            + `    ${keys
                        .filter(x => x !== 'cfid')
                        .map(key => `"${key}" = EXCLUDED."${key}"`)
                        .join(`,\n    `)}\n`
        );

        return sqlStatements;
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
