import { WebService, Mount, Get, Controller } from '@alterior/web-server';
import { CfWebhookController } from './webhook-controller';
import { Context } from '../common';

@Controller()
export class DiscontentedService {
    constructor(
        private context : Context
    ) {
    }

    @Mount('/webhook')
    webhookController : CfWebhookController;

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