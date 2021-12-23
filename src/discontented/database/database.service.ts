import { Injectable } from "@alterior/di";
import * as pg from 'pg';
import { Context } from "../common";
import * as fs from 'fs';

@Injectable()
export class DatabaseService {
    constructor(
        readonly context : Context
    ) {
        this.initialize();
    }

    configFile = 'database.json';
    config : pg.ClientConfig;

    private initialize() {
        let config : pg.ClientConfig;
        
        if (fs.existsSync(this.configFile)) {
            try {
                config = JSON.parse(fs.readFileSync(this.configFile).toString());
            } catch (e) {
                throw new Error(`Failed to parse database config file: ${e}`);
            }
        }

        this.config = config;
    }

    private async connect() {
        if (this.clientReady)
            return await this.clientReady;

        let config = this.config || {};
        if (process.env.DB_HOSTNAME)
            config.host = process.env.DB_HOSTNAME;
        if (process.env.DB_USERNAME)
            config.user = process.env.DB_USERNAME;
        if (process.env.DB_PASSWORD)
            config.password = process.env.DB_PASSWORD;
        if (process.env.DB_NAME)
            config.database = process.env.DB_NAME;

        console.log(`Connecting to PostgreSQL (${config.user}@${config.host}/${config.database})...`);

        this.client = new pg.Client(config);
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