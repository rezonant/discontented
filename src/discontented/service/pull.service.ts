import { Injectable } from "@alterior/di";
import { Context, CfEntry } from "../common";
import { DatabaseService } from "../database";
import { BatchImporter } from "../batch-importer";
import { OfflineContentfulLocator } from "../offline-asset-locator";
import { ContentfulManagementService } from "./contentful-management";
import { OnlineContentfulLocator } from "../online-asset-locator";
import { ContentfulDeliveryService } from "./contentful-delivery";

@Injectable()
export class PullService {
    constructor(
        private context : Context,
        private database : DatabaseService,
        private contentfulManagement : ContentfulManagementService,
        private contentfulDelivery : ContentfulDeliveryService
    ) {

    }

    async setEntryDeleted(entry : CfEntry) {
        let tableName = this.context.getTableNameForEntry(entry);
        await this.database.query(
            `UPDATE ${tableName} SET is_deleted = true WHERE cfid = $1`, 
            entry.sys.id
        );
    }

    async setEntryArchived(entry : CfEntry) {
        let tableName = this.context.getTableNameForEntry(entry);
        await this.database.query(
            `UPDATE ${tableName} SET is_archived = true WHERE cfid = $1`, 
            entry.sys.id
        );
    }

    async setEntryUnarchived(entry : CfEntry) {
        let tableName = this.context.getTableNameForEntry(entry);
        await this.database.query(
            `UPDATE ${tableName} SET is_archived = false WHERE cfid = $1`, 
            entry.sys.id
        );
    }

    async setEntryUnpublished(entry : CfEntry) {
        let tableName = this.context.getTableNameForEntry(entry);
        await this.database.query(
            `UPDATE ${tableName} SET is_published = false WHERE cfid = $1`, 
            entry.sys.id
        );
    }

    async importEntry(entry: CfEntry) {
        if (!this.context.schema)
            throw new Error(`No schema loaded`);
        
        let migrator = new BatchImporter(this.context, this.context.schema, new OnlineContentfulLocator(this.contentfulManagement, this.contentfulDelivery));
        let sqlQueries = await migrator.generateBatchSql([entry]);
        
        console.log(`Received updated data for entry ${entry.sys.id}`);

        for (let sqlQuery of sqlQueries)
            await this.database.query(sqlQuery);

        console.log(`Saved data successfully.`);
    }

    async importAll() {
        console.log(`Discontented: Exporting content from Contentful space '${this.context.definition.contentful.spaceId}'...`);
        let store = await this.contentfulManagement.fetchStore();
        let importer = new BatchImporter(this.context, store, new OfflineContentfulLocator(store));

        console.log(`Discontented: Creating SQL DML for ${store.entries.length} entries...`);
        let sqlCommands = await importer.generateBatchSql();

        console.log(`Importing into database [${sqlCommands.length} queries]...`);

        let count = 0;

        for (let sqlCommand of sqlCommands) {
            try {
                console.log(`INSERT ${count} / ${sqlCommands.length}`);
                //console.log(`  ${sqlCommand.replace(/\n/g, `\n  `)}`);
                await this.database.query(sqlCommand);
                count += 1;
            } catch (e) {
                console.error(`Error occurred while running query '${sqlCommand}'`);
                console.error(e);
                throw e;
            }
        }

        console.log(`Done!`);
    }
}