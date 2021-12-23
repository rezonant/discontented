import { Injectable } from "@alterior/di";
import * as pg from 'pg';
import { Context } from "../common";

@Injectable()
export class DatabaseService {
    constructor(
        readonly context : Context
    ) {
    }

    private async connect() {
        if (this.clientReady)
            return await this.clientReady;

        console.log(`Connecting to PostgreSQL...`);
        this.client = new pg.Client(this.context.definition.dbConnection);
        return this.clientReady = new Promise(async (resolve, reject) => {
            try {
                console.log(`PG client: connecting...`);
                await this.client.connect();
                console.log(`PG client: success`);
                resolve();
            } catch (e) {
                console.log(`PG client: failure`);
                reject(e);
            }
        })
    }

    private client : pg.Client;
    private clientReady : Promise<void>;

    async query(queryText : string, ...values : any[]): Promise<pg.QueryResult> {
        await this.connect();
        return await this.client.query(queryText, values);
    }

    getRowObjectsFromResult(result : pg.QueryResult): any[] {

        return result.rows;

        // let rowDatas = [];

        // for (let row of result.rows) {
        //     let rowData : any = {};

        //     for (let fieldNumber = 0; fieldNumber < result.fields.length; ++fieldNumber) {
        //         let fieldDef = result.fields[fieldNumber];
        //         rowData[fieldDef.columnID] = row[fieldNumber];
        //     }

        //     rowDatas.push(rowData);
        // }

        // return rowDatas;
    }

    async getRowByCfid(tableName : string, cfid : string): Promise<any> {
        let rowResult = await this.query(
            `SELECT * FROM ${tableName} WHERE "cfid" = $1 LIMIT 1`, 
            cfid
        );
        
        if (rowResult.rowCount === 0)
            throw new Error(`Could not find row cfid=${cfid} in table ${tableName}`);

        let rows = this.getRowObjectsFromResult(rowResult);
        return rows[0];
    }

    async getLinkingTableIds(linkingTableName : string, ownerCfid : string): Promise<string[]> {
        let rowResult = await this.query(
            `SELECT item_cfid FROM ${linkingTableName} WHERE "owner_cfid" = $1 LIMIT 1`, 
            ownerCfid
        );

        return rowResult.rows.map(row => row[0]);
    }

    async test() {
        await this.connect();
    }
}