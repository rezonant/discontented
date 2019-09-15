import * as contentfulExport from 'contentful-export';
import * as fs from 'fs';
import * as path from 'path';

import { Application } from '@alterior/runtime';

import { SchemaMigrator, BatchImporter, 
    CfStore, Context, Options, DiscontentedModule } from './discontented';
import { Module } from '@alterior/di';
import mkdirp = require('mkdirp');

export class DiscontentedCli {
    constructor() {
    }

    context : Context;

    static async main() {
        let instance = new DiscontentedCli();

        let exitCode = await instance.run(process.argv.slice(2));
        if (exitCode !== -1) {
            process.exit(exitCode);
        }
    }

    async fetchSchemaFromContentful(): Promise<CfStore> {
        console.log(`Fetching schema from Contentful...`);

        let result;

        result = await contentfulExport({
            skipContent: true,
            skipRoles: true,
            skipWebhooks: true,
            saveFile: false,

            ...this.context.definition.contentful
        });

        return result;
    }

    async cfReadStore(filename : string): Promise<CfStore> {
        return JSON.parse(fs.readFileSync(filename).toString());
    }

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

    saveCurrentSchema(schema : CfStore) {        
        console.log(`Saving Contentful schema to ${this.context.schemaFile}`);
        fs.writeFileSync(this.context.schemaFile, JSON.stringify(schema, undefined, 2));
    }

    async migrate(params : string[]) {

        let oldSchema = this.context.schema;
        let newSchema = await this.fetchSchemaFromContentful();

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

            this.saveCurrentSchema(newSchema);
        } else {
            console.log(`dcf: No changes to migrate.`);
        }
    }

    async import(params : string[]) {
        let store = await this.cfReadStore('data/demo-content.json');
        let importer = new BatchImporter(this.context, store);

        fs.writeFileSync('data/batch-update.sql', importer.generateBatchSql().join("\n;\n\n"));
    }

    async serve(params : string[]) {
        @Module({
            imports: [ DiscontentedModule.configure(this.context) ]
        })
        class AppModule {}

        await Application.bootstrap(AppModule);
    }

    showHelp() {
        console.log(`discontented v0.0.0`);
    }

    configFile : string = 'dcf.json';

    initialize() {
        if (!this.configFile) {
            console.error(`You must specify a configuration file using --config`);
            return false;
        }

        let config : Options;
        try {
            config = JSON.parse(fs.readFileSync(this.configFile).toString());
        } catch (e) {
            throw new Error(`Failed to parse config file: ${e}`);
        }

        this.context = new Context(config);

        return true;
    }

    async showConfig(params : string[]) {
        console.log(JSON.stringify(this.context.definition, undefined, 2));
        console.log(`--`);
        console.log(`Config loaded from: ${this.configFile}`);
    }

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
            this.showHelp();
            return 0;
        }

        let commands = {
            migrate: params => this.migrate(params),
            export: params => this.export(params),
            import: params => this.import(params),
            serve: params => this.serve(params),
            config: params => this.showConfig(params)
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
}