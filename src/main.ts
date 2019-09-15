#!/usr/bin/env node

import 'reflect-metadata';
import 'source-map-support/register';
import { Module } from '@alterior/di';
import { DiscontentedModule, Context } from './discontented';
import { RolesService, Application } from '@alterior/runtime';
import { DiscontentedCli } from './discontented/cli';

async function main() {
    let args = process.argv.slice();

    @Module({
        imports: [ DiscontentedModule.configure(new Context()) ]
    })
    class CliModule {
        constructor(
            roles : RolesService
        ) {
            roles.configure({ mode: 'only', roles: [] });
        }
    }

    let module = await Application.bootstrap(CliModule);
    let instance = module.inject(DiscontentedCli);

    let exitCode = await instance.run(args.slice(2));
    if (exitCode !== -1)
        process.exit(exitCode);
}

main();