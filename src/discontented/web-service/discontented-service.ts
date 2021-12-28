import { WebService, Mount, Get, Controller, Post } from '@alterior/web-server';
import { CfWebhookController } from './webhook-controller';
import { Context } from '../common';
import { PushController } from './push-controller';
import { DcfCommonModule } from '../common';
import { PullService } from '../service/pull.service';
import { ContentfulManagementService } from '../service/contentful-management';
@WebService({
    imports: [
        DcfCommonModule
    ],
    server: {
        port: 3001
    }
})
export class DiscontentedService {
    constructor(
        private context : Context,
        private pullService : PullService,
        private cfManagement : ContentfulManagementService
    ) {
    }

    @Mount('/webhook')
    webhookController : CfWebhookController;

    @Mount('/push')
    pushController : PushController;

    @Get('/')
    get() {
        let spaceId = '<not configured>';
        if (this.context.definition.contentful && this.context.definition.contentful.spaceId)
            spaceId = this.context.definition.contentful.spaceId;
        
        return { 
            service: 'discontented',
            contentful: {
                spaceId
            }
        };
    }

    @Post('/sync/entries/:entryID')
    async sync(entryID : string) {
        let entry = await this.cfManagement.getEntry(entryID);
        this.pullService.importEntry(entry);
    }
}