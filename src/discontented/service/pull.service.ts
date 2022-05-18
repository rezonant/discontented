import { Injectable } from "@alterior/di";
import { Context, CfEntry } from "../common";
import { DatabaseService } from "../database";
import { BatchImporter } from "../batch-importer";
import { OfflineContentfulLocator } from "../offline-asset-locator";
import { ContentfulManagementService } from "./contentful-management";
import { OnlineContentfulLocator } from "../online-asset-locator";
import { ContentfulDeliveryService } from "./contentful-delivery";
import { AssetUploader } from "./asset-uploader";
import { CfStore, CfAsset } from "../common";

@Injectable()
export class PullService {
    constructor(
        private context : Context,
        private database : DatabaseService,
        private contentfulManagement : ContentfulManagementService,
        private contentfulDelivery : ContentfulDeliveryService,
        private assetUploader : AssetUploader
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

        console.log(`Importing entry ${entry.sys.id}`);

        let migrator = new BatchImporter(
            this.context, 
            this.context.schema, 
            new OnlineContentfulLocator(this.contentfulManagement, this.contentfulDelivery),
            this.database
        );
        let sqlQueries = await migrator.generateBatchSql([entry]);
        
        console.log(`Received updated data for entry ${entry.sys.id} [${sqlQueries.length} queries]`);

        for (let sqlQuery of sqlQueries) {
            try {
                console.log(`Running SQL: ${sqlQuery}`);
                await this.database.query(sqlQuery);
            } catch (e) {
                console.error(`Caught error while running query '${sqlQuery}':`);
                console.error(e);
                
                throw new Error(`Caught error while running query '${sqlQuery}': ${e.message}`);
            }
        }

        console.log(`Saved data successfully.`);
    }

    async importAll() {
        let store = await this.contentfulManagement.fetchStore();
        await this.importAllEntriesFromStore(store);
        await this.importAllAssetsFromStore(store);
    }

    async importAllEntries() {
        let store = await this.contentfulManagement.fetchStore();
        await this.importAllEntriesFromStore(store);
    }

    async importAllAssets() {
        let store = await this.contentfulManagement.fetchStore(false);
        await this.importAllAssetsFromStore(store);
    }

    private async importAllEntriesFromStore(store : CfStore) {
        console.log(`[Entries] Importing ${store.entries.length} entries...`);

        let importer = new BatchImporter(
            this.context, 
            store, 
            new OfflineContentfulLocator(store),
            this.database
        );

        console.log(`[Entries] Generating SQL...`);
        let sqlCommands = await importer.generateBatchSql();

        console.log(`[Entries] Importing [${sqlCommands.length} queries]...`);
        let periodicUpdate = setInterval(() => {
            console.log(`[Entries] ${Math.round(count / sqlCommands.length * 100)}%  ${count} / ${sqlCommands.length}`);
        }, 10*1000);

        let count = 0;

        try {
            for (let sqlCommand of sqlCommands) {
                try {
                    //console.log(`INSERT ${count} / ${sqlCommands.length}`);
                    //console.log(`  ${sqlCommand.replace(/\n/g, `\n  `)}`);
                    await this.database.query(sqlCommand);
                    count += 1;
                } catch (e) {
                    console.error(`Error occurred while running query '${sqlCommand}'`);
                    console.error(e);
                    throw e;
                }
            }
        } finally {
            clearInterval(periodicUpdate);
        }

        console.log(`Done inserting content entries.`);
    }

    async importAsset(asset : CfAsset) {
        await this.assetUploader.transfer(asset);
    }

    private async importAllAssetsFromStore(store : CfStore) {
        if (!this.context.definition.assetBuckets || this.context.definition.assetBuckets.length === 0) {
            console.log(`[Assets] Skipping asset transfer: No buckets defined!`);
            return;
        }

        console.log(`[Assets] Transferring ${store.assets.length} assets...`);
        let count = store.assets.length;
        let done = 0;

        let progress = setInterval(() => {
            console.log(`[Assets] ${Math.round(done / count * 100)}%  ${done} / ${count}`);
        }, 5*1000);

        try {
            for (let asset of store.assets) {
                await this.importAsset(asset);
                done += 1;
            }
        } finally {
            clearInterval(progress);
        }

        console.log(`[Assets] Finished`);
    }
}