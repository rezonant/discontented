import { CfType } from "./common";
import { FieldToColumnMap } from "./field-to-column-map";

export interface TypeToTableMap {
    type : CfType;

    tableName : string;

    tableDeclarationSql : string;

    /**
     * Create this table and its linking tables.
     */
    createDdl : string;

    columns : FieldToColumnMap[];
}
