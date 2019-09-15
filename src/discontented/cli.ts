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
import { PullService } from './service/pull.service';
import { SchemaService } from './service/schema.service';

@Injectable()
export class DiscontentedCli {
    constructor(
        private roles : RolesService,
        private context : Context,
        private schemaService : SchemaService,
        private pullService : PullService
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
            let result = await contentfulExport({
                exportDir: 'exported-content',
                downloadAssets: true,
                ...this.context.definition.contentful
            });


            console.log(`Writing Contentful data to '${filename}'...`);
            fs.writeFileSync(filename, JSON.stringify(result));

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
     * Command: dcf serve
     * @param params 
     */
    async serve(params : string[]) {
        this.roles.start(WebServerModule);
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
}