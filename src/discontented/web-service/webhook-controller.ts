import { Controller, Post, RouteEvent, Body, Response } from "@alterior/web-server";
import { CF_TOPIC_ENTRY_PUBLISH, CF_TOPIC_ENTRY_UNPUBLISH, Context, CfEntry } from "../common";
import * as bodyParser from 'body-parser';
import { HttpError } from "@alterior/common";
import { PullService } from "../service/pull.service";

@Controller()
export class CfWebhookController {
    constructor(
        private context : Context,
        private pullService : PullService
    ) {

    }

    /**
     * POST /webhook
     * @param entry The JSON body of the request
     * @param event The route event 
     */
    @Post('', {
        middleware: [
            bodyParser.json({ 
                type: 'application/vnd.contentful.management.v1+json' 
            })
        ]
    })
    async post(@Body() entry : CfEntry, event : RouteEvent) {
        let cfTopic = event.request.headers['x-contentful-topic'];
        let handle = false;
        let isPublished = false;

        if (!entry)
            return Response.badRequest();

        if (cfTopic === CF_TOPIC_ENTRY_PUBLISH) {
            handle = true;
            isPublished = true;
        } else if (cfTopic === CF_TOPIC_ENTRY_UNPUBLISH) {
            handle = true;
        }

        if (!handle)
            return Response.ok();
        
        if (!this.context.schema) {
            return Response.serverError({ 
                type: 'fault', 
                message: `No schema loaded`
            });
        }
        
        try {
            await this.pullService.importEntry(entry);
        } catch (e) {
            console.error(`Caught error while importing entry:`);
            console.error(e);
            return Response.serverError({
                type: 'fault',
                message: e.message
            });
        }
    }
}