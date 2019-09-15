import { Controller, Post, RouteEvent, Body, Response } from "@alterior/web-server";
import { CF_TOPIC_ENTRY_PUBLISH, CF_TOPIC_ENTRY_UNPUBLISH, Context, CfEntry } from "../common";
import { BatchImporter } from "../schema-migrator";
import * as bodyParser from 'body-parser';
import { HttpError } from "@alterior/common";

@Controller()
export class CfWebhookController {
    constructor(
        private context : Context
    ) {

    }

    @Post('', {
        middleware: [
            bodyParser.json({ 
                type: 'application/vnd.contentful.management.v1+json' 
            })
        ]
    })
    post(@Body() entry : CfEntry, event : RouteEvent) {
        let cfTopic = event.request.headers['x-contentful-topic'];
        let handle = false;
        let isPublished = false;

        if (!entry)
            return Response.badRequest();

        // console.log("ENTRY:");
        // console.log(JSON.stringify(entry, undefined, 2));

        if (cfTopic === CF_TOPIC_ENTRY_PUBLISH) {
            handle = true;
            isPublished = true;
        } else if (cfTopic === CF_TOPIC_ENTRY_UNPUBLISH) {
            handle = true;
        }

        if (!this.context.schema) {
            return Response.serverError({ 
                type: 'fault', 
                message: `No schema loaded`,
                options: this.context.definition
            });
        }
        
        let migrator = new BatchImporter(this.context, this.context.schema);
        let sql = migrator.generateBatchSql([entry]);
        
        console.log(`UPDATE FROM CF:`);
        sql.forEach(line => console.log(line));
    }
}