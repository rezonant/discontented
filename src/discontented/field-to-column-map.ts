import { CfTypeField } from "./common";

export interface FieldToColumnMap {
    field : CfTypeField;

    columnName : string;
    columnDeclarationSql : string;

    linkingTableName : string;
    linkingTableDeclarationSql : string;
}
