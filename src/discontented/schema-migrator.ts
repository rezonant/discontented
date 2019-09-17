import { CfStore, CfType, CfEntry, CfLink, CfTypeField, CfLocalizedValue, Context, CfAsset } from "./common";
import { FieldToColumnMap } from "./field-to-column-map";
import { TypeToTableMap } from "./type-to-table-map";

export class SchemaMigrator {
    constructor(
        readonly context : Context
    ) {
    }
    
    private createAlterTable(oldType : CfType, newType : CfType) {
        let map = this.createTypeMap(newType);
        let newColumnSql : string[] = [];

        let sql = [];

        for (let field of newType.fields) {
            let existingField = oldType.fields.find(x => x.id === field.id);

            if (existingField) {
                if (existingField.type !== field.type) {
                    throw new Error(`Field '${field.id}' of type '${newType.name}' changed from type '${existingField.type}' to '${field.type}'. This is not supported!`);
                } else if (existingField.linkType !== field.linkType) {
                    throw new Error(`Field '${field.id}' of type '${newType.name}' changed from link type '${existingField.linkType}' to '${field.linkType}'. This is not supported!`);
                }
            } else {
                // New field, ALTER TABLE
                console.log(`Type '${map.type.sys.id}' added field '${field.id}'...`);
                let columnMap = map.columns.find(x => x.field.id === field.id);
                
                console.log(JSON.stringify(columnMap, undefined, 2));
                if (columnMap.linkingTableName)
                    sql.push(columnMap.linkingTableDeclarationSql);

                if (columnMap.columnDeclarationSql)
                    newColumnSql.push(columnMap.columnDeclarationSql);
            }
        }
        
        if (newColumnSql.length > 0) {
            sql.push(
                `ALTER TABLE ${map.tableName}\n`
                + `${newColumnSql.map(x => `  ADD COLUMN ${x}`).join(`,\n`)}`
            );
        }
         
        if (sql.length === 0)
            return null;

        return sql.join(`;\n\n`);
    }

    private createColumnMap(table : TypeToTableMap, field : CfTypeField): FieldToColumnMap {
        
        let columnName = this.context.getColumnNameForFieldId(field.id);
        let dataType = 'unknown';
        let isArray = false;
        let fieldType = field.type;

        if (field.type === 'Array') {
            isArray = true;
            fieldType = field.items.type;
        }
        
        let skipColumn = false;
        let linkingTableName = null;
        let linkingTableDeclarationSql = null;

        if (fieldType === 'Link') {
            let linkType = field.linkType;

            if (field.type === 'Array') {
                isArray = true;
                linkType = field.items.linkType;
            }

            if (isArray) {
                linkingTableName = `${table.tableName}_${this.context.transformIdentifier(field.id)}`
                linkingTableDeclarationSql = 
                      `CREATE TABLE ${linkingTableName} (\n`
                    + `    "owner_cfid" VARCHAR(64),\n`
                    + `    "item_cfid" VARCHAR(64) UNIQUE\n`
                    + `)`
                ;
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

        return {
            field,
            columnName: skipColumn ? null : columnName,
            columnDeclarationSql: skipColumn ? null : `"${columnName}" ${dataType}`,
            linkingTableName,
            linkingTableDeclarationSql
        }
    }

    private createTypeMap(type : CfType): TypeToTableMap {
        let table : TypeToTableMap = {
            type,

            tableName: this.context.getTableNameForTypeId(type.sys.id),
            columns: [],

            tableDeclarationSql: null,
            createDdl: null
        }

        for (let field of type.fields) {
            table.columns.push(this.createColumnMap(table, field));
        }
        
        let columnDefinitions = [];

        columnDefinitions.push(`"id" BIGSERIAL PRIMARY KEY`);
        columnDefinitions.push(`"environment_cfid" VARCHAR(64)`);
        columnDefinitions.push(`"cfid" VARCHAR(64) UNIQUE`);
        columnDefinitions.push(...table.columns.map(x => x.columnDeclarationSql).filter(x => x));

        columnDefinitions.push(`"created_at" TIMESTAMP`);
        columnDefinitions.push(`"updated_at" TIMESTAMP`);
        columnDefinitions.push(`"published_at" TIMESTAMP`);
        columnDefinitions.push(`"first_published_at" TIMESTAMP`);
        columnDefinitions.push(`"is_archived" BOOLEAN`);
        columnDefinitions.push(`"is_deleted" BOOLEAN`);
        columnDefinitions.push(`"is_published" BOOLEAN`);

        columnDefinitions.push(`"published_version" INT`);
        columnDefinitions.push(`"raw" JSONB`);
        
        table.tableDeclarationSql = 
              `CREATE TABLE ${table.tableName} (\n` 
            + `    ${columnDefinitions.join(`,\n    `)}\n`
            + `)`
        ;

        table.createDdl = [ ...table.columns.filter(x => x.linkingTableName).map(x => x.linkingTableDeclarationSql), table.tableDeclarationSql ].join(";\n\n");

        return table;
    }

    private createTableForType(contentType : CfType) {
        let map = this.createTypeMap(contentType);
        return map.createDdl;
    }

    /**
     * Create a SQL migration representing the change between the two 
     * given schema versions.
     * 
     * @param oldSchema 
     * @param newSchema 
     */
    migrate(oldSchema : CfStore, newSchema : CfStore): string {

        let isFirstMigration = false;

        if (!oldSchema) {
            isFirstMigration = true;
            oldSchema = { contentTypes: [] };
        }

        let sql = '';

        if (isFirstMigration) {
            sql += `\n`;
            sql += `-- *************************************************************\n`
            sql += `-- *\n`
            sql += `-- * TRACK MIGRATIONS [${this.context.tablePrefix}migrations]\n`;
            sql += `-- *\n`
            sql += `-- **\n`
            sql += `\n`;
            sql += `CREATE TABLE ${this.context.tablePrefix}migrations (\n`
            sql += `    version VARCHAR(30) UNIQUE\n`;
            sql += `);\n`;
        }

        for (let newType of newSchema.contentTypes) {
            let oldType = oldSchema.contentTypes.find(x => x.sys.id === newType.sys.id);

            if (oldType) {
                let alterTable = this.createAlterTable(oldType, newType);
                if (alterTable) {
                    sql += `\n`;
                    sql += `-- *************************************************************\n`
                    sql += `-- *\n`
                    sql += `-- * MODIFIED CONTENT TYPE: ${newType.name} [${newType.sys.id}]\n`;
                    sql += `-- *\n`
                    sql += `-- **\n`
                    sql += `\n`;
                    sql += alterTable;
                    sql += `;\n`;
                }
            } else {
                sql += `\n`;
                sql += `-- *************************************************************\n`
                sql += `-- *\n`
                sql += `-- * NEW CONTENT TYPE: ${newType.name} [${newType.sys.id}]\n`;
                sql += `-- *\n`
                sql += `-- **\n`
                sql += `\n`;
                sql += this.createTableForType(newType);
                sql += `;\n`;
            }
        }

        if (sql === '')
            return null;

        return sql;
    }
}
