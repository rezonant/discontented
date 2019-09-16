import { Injectable } from "@alterior/di";
import { Context, CfEntry } from "../common";
import { BatchImporter } from "../schema-migrator";
import { DatabaseService } from "../database";

@Injectable()
export class PullService {
    constructor(
        private context : Context,
        private database : DatabaseService
    ) {

    }

    async importEntry(entry: CfEntry) {
        if (!this.context.schema)
            throw new Error(`No schema loaded`);
        
        let migrator = new BatchImporter(this.context, this.context.schema);
        let sqlQueries = migrator.generateBatchSql([entry]);
        
        console.log(`Received updated data for entry ${entry.sys.id}:`);
        sqlQueries.forEach(line => console.log(`- ${line}`));

        for (let sqlQuery of sqlQueries)
            await this.database.query(sqlQuery);

        console.log(`Saved data successfully.`);
    }

    async importAll() {
        console.log(`Discontented: Exporting content from Contentful space '${this.context.definition.contentful.spaceId}'...`);
        let store = await this.context.fetchStore();
        let importer = new BatchImporter(this.context, store);

        console.log(`Discontented: Creating SQL DML for ${store.entries.length} entries...`);
        let sqlCommands = importer.generateBatchSql();

        console.log(`Importing into database...`);

        for (let sqlCommand of sqlCommands) {
            try {
                await this.database.query(sqlCommand);
            } catch (e) {
                console.error(`Error occurred while running query '${sqlCommand}'`);
                console.error(e);
                throw e;
            }
        }

        console.log(` (TODO)`);

        //fs.writeFileSync('data/batch-update.sql', );
    }
}