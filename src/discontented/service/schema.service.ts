import * as fs from 'fs';
import * as path from 'path';
import * as mkdirp from 'mkdirp';
import * as pg from 'pg';

import { Injectable } from "@alterior/di";
import { Context } from "../common";
import { DatabaseService } from "../database";
import { SchemaMigrator } from "../schema-migrator";
import { ContentfulManagementService } from './contentful-management';

@Injectable()
export class SchemaService {
    constructor(
        private context : Context,
        private database : DatabaseService,
        private contentfulManagement : ContentfulManagementService
    ) {

    }

    async migrate() {
        
        let oldSchema = this.context.schema;
        let newSchema = await this.contentfulManagement.fetchSchema();

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
        console.log(`Apply migrations: Started`);

        let result : pg.QueryResult;
        let appliedVersions : string[] = [];

        try {
            console.log(`Acquiring current version from DB...`);
            result = await this.database.query(`SELECT version FROM ${this.context.tablePrefix}migrations`);
            appliedVersions = result.rows.map(row => row.version);

            console.log(`Found ${appliedVersions.length} versions in DB...`);

        } catch (e) {
            if (e.code === '42P01') {
                // relation doesn't exist: run all migrations
                console.info(`No ${this.context.tablePrefix}migrations table is present, applying all migrations...`);
                appliedVersions = [];
            } else {
                console.error(`Caught error while trying to fetch applied schema versions:`);
                console.error(e);
                throw e;
            }
        }

        console.log(`Reading migrations...`);
        let migrationFiles = fs.readdirSync(this.context.migrationDirectory).sort((a, b) => a.localeCompare(b));
        migrationFiles = migrationFiles.filter(x => x.endsWith('.sql'));
        let ran = 0;

        for (let migrationFile of migrationFiles) {
            let isApplied = appliedVersions.includes(migrationFile);

            if (!isApplied) {
                ran += 1;
                console.log(` - Applying migration '${migrationFile}'...`);
                let content = fs.readFileSync(path.join(this.context.migrationDirectory, migrationFile)).toString();
                try {
                    await this.database.query(content);
                } catch (e) {
                    console.error(`Caught exception while applying migration '${migrationFile}'`);
                    console.error(e);
                    throw e;
                }

                // save the fact that we ran it

                console.log(`   * Marking as run`);
                await this.database.query(
                    `INSERT INTO ${this.context.tablePrefix}migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING`, 
                    migrationFile
                );

                console.log(`   [complete]`);
            }
        }

        if (ran === 0) 
            console.log(`No migrations need to be run. [${migrationFiles.length} migration(s) examined]`);
        else
            console.log(`Applied ${ran} migration(s). [${migrationFiles.length} total migration(s)]`);
    }
}