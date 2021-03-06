import { Controller, Post, WebEvent, Body, Response } from "@alterior/web-server";
import { CF_TOPIC_ENTRY_PUBLISH, CF_TOPIC_ENTRY_UNPUBLISH, CF_TOPIC_ENTRY_AUTO_SAVE, Context, CfEntry, CF_TOPIC_ENTRY_SAVE, CF_TOPIC_ENTRY_DELETE, CF_TOPIC_ENTRY_ARCHIVE, CF_TOPIC_ENTRY_UNARCHIVE, CF_TOPIC_ENTRY_CREATE } from "../common";
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
    async post(@Body() entry : CfEntry) {
        if (!entry)
            return Response.badRequest();

        let cfTopic = <string>WebEvent.request.headers['x-contentful-topic'];

        if (cfTopic === CF_TOPIC_ENTRY_UNPUBLISH) {
            await this.pullService.setEntryUnpublished(entry);
            return Response.ok();
        } else if (cfTopic === CF_TOPIC_ENTRY_DELETE) {
            await this.pullService.setEntryDeleted(entry);
            return Response.ok();
        } else if (cfTopic === CF_TOPIC_ENTRY_ARCHIVE) {
            await this.pullService.setEntryArchived(entry);
            return Response.ok();
        } else if (cfTopic === CF_TOPIC_ENTRY_UNARCHIVE) {
            await this.pullService.setEntryUnarchived(entry);
            return Response.ok();
        }


        // The rest is for create/save/publish

        if (![CF_TOPIC_ENTRY_AUTO_SAVE, CF_TOPIC_ENTRY_PUBLISH, CF_TOPIC_ENTRY_SAVE, CF_TOPIC_ENTRY_CREATE].includes(cfTopic)) {
            console.log(`Unhandled webhook topic: ${cfTopic}, skipping!`);
            return;
        }
        
        if (!this.context.schema) {
            console.error(`Cannot import content from webhook: No schema loaded`);

            return Response.serverError({ 
                type: 'fault', 
                message: `Cannot import content from webhook: No schema loaded`
            });
        }
        
        // If this is a publish event, then the entry that was sent to us is already up to date.
        // We should avoid pulling the latest published entry from the Delivery API, as the Delivery API
        // may have stale information since we are processing this so close to the change at Contentful.

        entry.__webhook = true;
        
        if (cfTopic === CF_TOPIC_ENTRY_PUBLISH)
            entry.__published = true;

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