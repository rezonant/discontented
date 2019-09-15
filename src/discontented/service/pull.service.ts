import { Injectable } from "@alterior/di";
import { Context } from "../common";
import { BatchImporter } from "../schema-migrator";
import { DatabaseService } from "../database";

@Injectable()
export class PullService {
    constructor(
        private context : Context,
        private database : DatabaseService
    ) {

    }

    async importAll() {
        console.log(`Discontented: Exporting content from Contentful space '${this.context.definition.contentful.spaceId}'...`);
        let store = await this.context.fetchStore();
        let importer = new BatchImporter(this.context, store);

        console.log(`Discontented: Creating SQL DML for ${store.entries.length} entries...`);
        let sql = importer.generateBatchSql().join("\n;\n\n");

        console.log(`Importing into database...`);

        console.log(` (TODO)`);

        //fs.writeFileSync('data/batch-update.sql', );
    }
}