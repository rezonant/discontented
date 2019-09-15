import * as contentfulExport from 'contentful-export';
import * as fs from 'fs';
import * as path from 'path';

import { Application, RolesService } from '@alterior/runtime';
import { Module, Injectable } from '@alterior/di';
import mkdirp = require('mkdirp');
import { WebServerModule } from '@alterior/web-server';
import { DatabaseService } from './database';
import { Context, CfStore, Options } from './common';
import { SchemaMigrator, BatchImporter } from './schema-migrator';
import { timeout } from '@alterior/common';

@Injectable()
export class DiscontentedCli {
    constructor(
        private roles : RolesService,
        private context : Context
    ) {
    }

    private configFile : string = 'discontented.json';

    /**
     * Main method
     * @param args 
     */
    async run(args : string[]): Promise<number> {
        let cmd : string;
        let params = [];

        for (let i = 0; i < args.length; ++i) {

            function consumeParam(optionName) {
                if (i + 1 >= args.length) 
                    throw new Error(`Option ${optionName} requires an argument`);

                return args[++i];
            }

            let arg = args[i];
            
            if (arg.startsWith('-')) {
                let optionName = arg.replace(/^--?/, '');

                switch (optionName) {
                    case 'c':
                    case 'config':
                        this.configFile = consumeParam('config');
                        
                        console.log(`Specified config ${this.configFile}`);

                        if (!fs.existsSync(this.configFile)) {
                            console.error(`Could not locate config file '${this.configFile}'!`);
                            return 1;
                        }
                }
            } else {
                params.push(arg);
            }
        }

        cmd = params[0] || 'help';
        params.shift();

        if (cmd === 'help') {
            this.showHelp(params);
            return 0;
        }

        let commands = {
            migrate: params => this.migrate(params),
            export: params => this.export(params),
            import: params => this.import(params),
            serve: params => this.serve(params),
            config: params => this.showConfig(params),
            'apply-migrations': params => this.applyMigrations(params)
        }

        if (commands[cmd] === undefined) {
            console.error(`dcf: no such command '${cmd}'`);
            return 1;
        }

        if (!this.initialize()) {
            console.error(`dcf: Failed to initialize. Exiting!`);
            return 1;
        }

        try {
            await commands[cmd](params);
        } catch (e) {
            console.error(`Caught exception while running command '${cmd}':`);
            console.error(e);
            return 1;
        }

        if (cmd === 'serve')
            return -1;

        // ----------------------------------------

        console.log(`Discontented: All done!`);
        return 0;
    }

    /**
     * Prepare the context by reading configuration file, etc
     */
    initialize() {
        if (!fs.existsSync(this.configFile)) {
            console.error(`dcf: Error: Could not open config file '${this.configFile}'`);
            return false;
        }

        let config : Options;
        try {
            config = JSON.parse(fs.readFileSync(this.configFile).toString());
        } catch (e) {
            throw new Error(`Failed to parse config file: ${e}`);
        }

        this.context.definition = config;

        return true;
    }

    /**
     * Command: dcf export
     * @param params 
     */
    async export(params : string[]) {
        try {
            let result = await contentfulExport({
                exportDir: 'exported-content',
                downloadAssets: true,
                ...this.context.definition.contentful
            });

            fs.writeFileSync('data/demo-content.json', JSON.stringify(result));

        } catch (e) {
            console.error(`Caught error while exporting from Contentful: ${e}`);
            return;
        }
    }

    /**
     * Command: dcf migrate
     * @param params 
     */
    async migrate(params : string[]) {

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

    /**
     * Command: dcf import
     * @param params 
     */
    async import(params : string[]) {
        this.context.fetchStore();
        let store = await this.context.fetchStore();
        let importer = new BatchImporter(this.context, store);

        fs.writeFileSync('data/batch-update.sql', importer.generateBatchSql().join("\n;\n\n"));
    }

    /**
     * Command: dcf serve
     * @param params 
     */
    async serve(params : string[]) {
        this.roles.start(WebServerModule);
    }

    /**
     * Command: dcf help
     */
    showHelp(params : string[]) {
        console.log(`discontented v0.0.0`);
    }

    /**
     * Command: dcf apply-migrations
     * @param params 
     */
    async applyMigrations(params : string[]) {
        // TODO
    }

    /**
     * Command: dcf config
     * @param params 
     */
    async showConfig(params : string[]) {
        console.log(JSON.stringify(this.context.definition, undefined, 2));
        console.log(`--`);
        console.log(`Config loaded from: ${this.configFile}`);
    }
}