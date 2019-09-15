import { Controller, Post, Patch, Body, Response } from "@alterior/web-server";
import * as bodyParser from 'body-parser';
import { PushService, PushUpdate } from "../service";

@Controller()
export class PushController {
    constructor(
        private pushService : PushService
    ) {

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
            
        }
        return {
            status: 'success'
        }
    }
}