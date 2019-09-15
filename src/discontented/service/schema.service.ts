import * as fs from 'fs';
import * as path from 'path';
import * as mkdirp from 'mkdirp';

import { Injectable } from "@alterior/di";
import { Context } from "../common";
import { DatabaseService } from "../database";
import { SchemaMigrator } from "../schema-migrator";

@Injectable()
export class SchemaService {
    constructor(
        private context : Context,
        private database : DatabaseService
    ) {

    }

    async migrate() {
        
        let oldSchema = this.context.schema;
        let newSchema = await this.context.fetchSchemaFromContentful();

        let migrator = new SchemaMigrator(this.context);

        console.log(`Generating SQL schema...`);
        let sql = await migrator.migrate(oldSchema, newSchema);

        if (sql) {
            let filename = path.join(
                this.context.migrationDirectory, 
                `${new Date().toISOString().replace(/T/, '_') .replace(/\..*$/, '').replace(/[^0-9_]/g, '')}.sql`
            );

            if (!fs.existsSync(this.context.migrationDirectory)) {
                console.log(`Creating migrations directory at '${this.context.migrationDirectory}'`);
                mkdirp.sync(this.context.migrationDirectory);
            }
            
            console.log(`Writing new migration file '${filename}'...`);
            fs.writeFileSync(filename, sql);

            this.context.saveCurrentSchema(newSchema);
        } else {
            console.log(`dcf: No changes to migrate.`);
        }
    }

    async applyMigrations() {
        // TODO
    }
}