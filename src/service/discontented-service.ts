import { WebService, Mount, Get } from '@alterior/web-server';
import { CfWebhookController } from './webhook-controller';

@WebService()
export class DiscontentedService {
    @Mount('/webhook')
    webhookController : CfWebhookController;

    @Get('/')
    get() {
        return { service: 'discontented' };
    }
}