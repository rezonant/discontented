import * as contentfulExport from 'contentful-export';
import * as fs from 'fs';

import { RolesService } from '@alterior/runtime';
import { Injectable } from '@alterior/di';
import { Context, Options } from './common';
import { PullService } from './service/pull.service';
import { SchemaService } from './service/schema.service';
import { ContentfulManagementService } from './service/contentful-management';
import { DatabaseService } from '.';

@Injectable()
export class DiscontentedCli {
    constructor(
        private roles : RolesService,
        private context : Context,
        private schemaService : SchemaService,
        private pullService : PullService,
        private contentfulManagement : ContentfulManagementService,
        private db : DatabaseService
    ) {
        if (process.env.DCF_CONFIG)
            this.configFile = process.env.DCF_CONFIG;
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
            'import:assets': params => this.importAssets(params),
            'import:entries': params => this.importEntries(params),
            serve: params => this.serve(params),
            config: params => this.showConfig(params),
            dbtest: params => this.dbTest(params),
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
     * Command: dcf export <filename.json>
     * @param params 
     */
    async export(params : string[]) {
        if (params.length === 0) {
            console.error(`Usage: dcf export <filename.json>`);
            return;
        }
        
        let filename = params[0];

        try {

            let store = await this.contentfulManagement.fetchStore();

            console.log(`Writing Contentful data to '${filename}'...`);
            fs.writeFileSync(filename, JSON.stringify(store, undefined, 2));

        } catch (e) {
            console.error(`Caught error while exporting from Contentful:`);
            console.error(e);
            
            return;
        }
    }

    /**
     * Command: dcf migrate
     * @param params 
     */
    async migrate(params : string[]) {
        await this.schemaService.migrate();
    }

    /**
     * Command: dcf import
     * @param params 
     */
    async import(params : string[]) {
        await this.pullService.importAll();
    }

    /**
     * Command: dcf import:entries
     * @param params 
     */
    async importEntries(params : string[]) {
        if (params.length === 0) {
            await this.pullService.importAllEntries();
            return;
        }

        for (let entryID of params) {
            let entry = await this.contentfulManagement.getEntry(entryID);
            console.log(`Importing entry ${entryID}...`);
            await this.pullService.importEntry(entry);
        }
    }

    /**
     * Command: dcf import:assets
     * @param params 
     */
    async importAssets(params : string[]) {
        if (params.length === 0) {
            await this.pullService.importAllAssets();
            return;
        }

        for (let assetID of params) {
            let asset = await this.contentfulManagement.getAsset(assetID);
            console.log(`Importing asset ${assetID}...`);
            await this.pullService.importAsset(asset);
        }
    }

    /**
     * Command: dcf serve
     * @param params 
     */
    async serve(params : string[]) {
        this.roles.roles.find(x => x.identifier === 'web-server').start();
    }

    /**
     * Command: dcf help
     */
    async showHelp(params : string[]) {
        console.log(`discontented v0.0.0`);
    }

    /**
     * Command: dcf apply-migrations
     * @param params 
     */
    async applyMigrations(params : string[]) {
        console.log(`command: applyMigrations`);
        await this.schemaService.applyMigrations();
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

    async dbTest(params : string[]) {
        await this.db.test();
        console.log(`DB connection test was successful`);
    }
}