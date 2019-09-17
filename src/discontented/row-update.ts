
export interface RowUpdate {
    onConflict : 'update' | 'nothing';
    data : Map<string, any>;
    uniqueKey : string;
}
