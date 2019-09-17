import { Injectable } from "@alterior/di";
import { Context, CfEntry } from "../common";
import { DatabaseService } from "../database";
import { BatchImporter } from "../batch-importer";
import { OfflineAssetLocator } from "../offline-asset-locator";
import { ContentfulManagementService } from "./contentful-management";
import { OnlineAssetLocator } from "../online-asset-locator";

@Injectable()
export class PullService {
    constructor(
        private context : Context,
        private database : DatabaseService,
        private contentfulManagement : ContentfulManagementService
    ) {

    }

    async importEntry(entry: CfEntry) {
        if (!this.context.schema)
            throw new Error(`No schema loaded`);
        
        let migrator = new BatchImporter(this.context, this.context.schema, new OnlineAssetLocator(this.contentfulManagement));
        let sqlQueries = await migrator.generateBatchSql([entry]);
        
        console.log(`Received updated data for entry ${entry.sys.id}:`);
        sqlQueries.forEach(line => console.log(`- ${line}`));

        for (let sqlQuery of sqlQueries)
            await this.database.query(sqlQuery);

        console.log(`Saved data successfully.`);
    }

    async importAll() {
        console.log(`Discontented: Exporting content from Contentful space '${this.context.definition.contentful.spaceId}'...`);
        let store = await this.contentfulManagement.fetchStore();
        let importer = new BatchImporter(this.context, store, new OfflineAssetLocator(store));

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