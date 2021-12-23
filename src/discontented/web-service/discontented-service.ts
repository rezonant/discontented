import { WebService, Mount, Get, Controller } from '@alterior/web-server';
import { CfWebhookController } from './webhook-controller';
import { Context } from '../common';
import { PushController } from './push-controller';
import { DcfCommonModule } from '../common';
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
        private context : Context
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
}