import * as contentfulExport from 'contentful-export';
import * as fs from 'fs';
import { CfStore, CfType } from './contentful';
import { SchemaMigrator, Context, BatchImporter } from './schema-migrator';

import * as sourceMapSupport from 'source-map-support';
import { CREDENTIALS } from './credentials';
sourceMapSupport.install();

// --------------------

async function getSchema(context : Context) {
    try {
        let result;
    
        result = await contentfulExport({
            skipContent: true,
            ...context.credentials
        });

        fs.writeFileSync('contentful-schema.json', JSON.stringify(result));

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

        fs.writeFileSync('demo-content.json', JSON.stringify(result));

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

    fs.writeFileSync('schema.sql', sql);
}

async function doBatchImport(context : Context) {
    let store = await cfReadStore('demo-content.json');
    let importer = new BatchImporter(context, store);

    fs.writeFileSync('batch-update.sql', importer.generateBatchSql().join("\n;\n\n"));
}

async function main() {
    let context = new Context({
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

    //await fullExport(context);
    //await generateSchema(context);
    await doBatchImport(context);
    
    console.log(`Discontented: All done!`);
}

main();