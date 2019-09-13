import * as changeCase from 'change-case';
import * as fs from 'fs';

import { CfTypeField, CfEntry, CfType, CfSpaceCredentials, CfStore } from './contentful';
import { Options } from './options';
import { InjectionToken, Inject, Optional, Injectable } from '@alterior/di';

export const DCF_OPTIONS = new InjectionToken('DCF_OPTIONS');

@Injectable()
export class Context {
    constructor(
        @Optional() @Inject(DCF_OPTIONS)
        readonly definition : Options = {}
    ) {
        if (!this.definition)
            this.definition = {};
    }

    private _credentials : CfSpaceCredentials;

    get defaultLocalization() {
        return this.definition.defaultLocalization || 'en-US';
    }

    get tablePrefix() {
        return this.definition.tablePrefix;
    }

    private _schema : CfStore = null;
    get schema() : CfStore {
        if (!this._schema) {
            if (this.definition.schemaFile) {
                this._schema = JSON.parse(fs.readFileSync(this.definition.schemaFile).toString());
            }
        }

        return this._schema;
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

    private typeIdToTableName = new Map<string, string>();
    private tableNameToTypeId = new Map<string, string>();

    addMappingForTypeId(typeId : string) {
        let tableName = this.getTableNameForTypeId(typeId);
        this.typeIdToTableName.set(typeId, tableName);
        this.tableNameToTypeId.set(tableName, typeId);
    }

    getTypeIdForTableName(tableName : string) {
        return this.tableNameToTypeId.get(tableName);
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
