import 'source-map-support/register';

import * as contentfulExport from 'contentful-export';
import * as fs from 'fs';
import { SchemaMigrator, BatchImporter } from './schema-migrator';
import { CREDENTIALS } from './credentials';
import { CfStore, Context } from './common';
import { Application } from '@alterior/runtime';
import { ServiceModule } from './service/service.module';
import { AppModule } from './app.module';

// --------------------

async function getSchema(context : Context) {
    try {
        let result;
    
        result = await contentfulExport({
            skipContent: true,
            ...context.credentials
        });

        fs.writeFileSync('data/contentful-schema.json', JSON.stringify(result));

    } catch (e) {
        console.error(`Caught error while exporting from Contentful: ${e}`);
        return;
    }
}

async function cfReadStore(filename : string): Promise<CfStore> {
    return JSON.parse(fs.readFileSync(filename).toString());
}

async function fullExport(context : Context) {
    try {
        let result = await contentfulExport({
            exportDir: 'exported-content',
            downloadAssets: true,
            ...context.credentials
        });

        fs.writeFileSync('data/demo-content.json', JSON.stringify(result));

    } catch (e) {
        console.error(`Caught error while exporting from Contentful: ${e}`);
        return;
    }
}

async function generateSchema(context : Context) {
    let schema = await cfReadStore('contentful-schema.json');
    let migrator = new SchemaMigrator(context, schema);

    console.log(`Generating SQL schema...`);
    let sql = await migrator.createSchema();

    fs.writeFileSync('data/schema.sql', sql);
}

async function doBatchImport(context : Context) {
    let store = await cfReadStore('data/demo-content.json');
    let importer = new BatchImporter(context, store);

    fs.writeFileSync('data/batch-update.sql', importer.generateBatchSql().join("\n;\n\n"));
}

async function runServer(context : Context) {
    Application.bootstrap(AppModule);
}

async function main() {
    let context = new Context({
        schemaFile: 'data/contentful-schema.json',
        tablePrefix: 'discontented_',
        tableMap: {
            sFzTZbSuM8coEwygeUYes: 'franchises',
            episode: 'productions',
            talent: 'talent',
            articlePortion: 'article_blocks',
            audioMedia: 'podcasts',
            clip: 'vods'
        }    
    });

    context.setCredentials(CREDENTIALS);

    // ----------------------------------------

    runServer(context);
    //await fullExport(context);
    //await generateSchema(context);
    await doBatchImport(context);
    
    console.log(`Discontented: All done!`);
}

main();