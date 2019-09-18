import { Controller, Post, Patch, Body, Response, Get } from "@alterior/web-server";
import * as bodyParser from 'body-parser';
import { PushService, PushUpdate } from "../service";

@Controller()
export class PushController {
    constructor(
        private pushService : PushService
    ) {

    }

    @Get()
    get() {
        return { ok: true };
    }

    @Patch('', {
        middleware: [
            bodyParser.json()
        ]
    })
    async patch(@Body() repr : PushUpdate) {
        try {
            await this.pushService.push(repr);
        } catch (e) {
            console.error(`Error occurred while pushing entry ${repr.cfid} to Contentful:`);
            console.error(e);
        }
        return {
            status: 'success'
        }
    }
}