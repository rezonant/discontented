import * as pg from 'pg';

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

export interface ContentfulOptions {
    spaceId : string;
    environmentId? : string;
    managementToken : string;
}

export interface Options {
    tablePrefix? : string;
    tableMap? : TableMap;
    defaultLocalization? : string;
    schemaFile? : string;
    migrationDirectory? : string;

    contentful? : ContentfulOptions;
    dbConnection? : pg.ClientConfig;

    transformIdentifier? : (id : string) => string;
    deriveTableNameFromContentfulType? : (id : string) => string;
    pluralize? : (id : string) => string;
}
