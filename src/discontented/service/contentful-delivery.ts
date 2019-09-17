import { Injectable } from "@alterior/di";
import { Context, CfArray, CfSpace, CfEnvironment, CfOrganization, CfEntry, CfSnapshot, CfAsset, CfStore, CfResourceQuery } from "../common";
import { timeout } from "@alterior/common";
import fetch from 'node-fetch';
import { RequestInit, BodyInit } from 'node-fetch';

@Injectable()
export class ContentfulDeliveryService {
    constructor(
        private context : Context
    ) {
    }

    async request<T>(method : string, url : string, body? : any, state? : any): Promise<T> {
        if (!state) {
            state = {
                retry: 0
            }
        }

        let requestInit : RequestInit = {
            method,
            headers: {
                Authorization: `Bearer ${this.context.definition.contentful.managementToken}`
            }
        };

        if (body) {
            let bodyText = JSON.stringify(body);
            requestInit.body = bodyText;
        }

        if (url.includes('?')) {
            url += `&access_token=${this.deliveryToken}`;
        } else {
            url += `?access_token=${this.deliveryToken}`;
        }
        
        let response = await fetch(`${this.baseUrl}/${url.replace(/^\//g, '')}`, requestInit);

        if (response.status === 429) {
            if (state.retry > 10) {
                console.error(`Contentful: ${method} ${url}: Too many retries (${state.retry})`);
                throw new Error(`Contentful: ${method} ${url}: Too many retries (${state.retry})`);
            }

            // Wait until Contentful is ready...

            let secondsRemaining = parseInt(response.headers.get('X-Contentful-RateLimit-Second-Remaining'));
            let jitter = Math.floor(secondsRemaining * 0.1 * Math.random() * 1000);
            await timeout(secondsRemaining * 1000 + jitter);

            state.retry += 1;
            await this.request(method, url, body, state);
        } else if (response.status >= 400) {
            throw response;
        }

        // success
        return await response.json();
    }

    async get<T>(url : string, headers? : HeadersInit): Promise<T> {
        return await this.request<T>('GET', url, undefined, headers);
    }

    async getFromCollection<T>(url : string, query : CfResourceQuery, headers? : HeadersInit): Promise<CfArray<T>> {
        return await this.get(`${url}${this.queryString(query)}`, headers);
    }

    async post<T>(url : string, data : T, headers? : HeadersInit) {
        return await this.request('POST', url, data, headers);
    }

    async delete(url : string, headers? : HeadersInit) {
        return await this.request('DELETE', url, undefined, headers);
    }

    async put<T>(url : string, data : T, headers? : HeadersInit) {
        return await this.request('PUT', url, data, headers);
    }

    async getSpaces() {
        return await this.get<CfArray<CfSpace>>('/spaces');
    }

    async getSpace(id : string) {
        return await this.get<CfSpace>(`/spaces/${id}`);
    }

    get spaceId() {
        return this.context.definition.contentful.spaceId;
    }

    get managementToken() {
        return this.context.definition.contentful.managementToken;
    }

    get deliveryToken() {
        return this.context.definition.contentful.deliveryToken;
    }

    get environmentId() {
        return this.context.definition.contentful.environmentId || 'master';
    }

    async getEnvironments() {
        return await this.get<CfArray<CfEnvironment>>(`/spaces/${this.spaceId}/environments`);
    }

    async getEnvironment() {
        return await this.get<CfEnvironment>(`/spaces/${this.spaceId}/environments/${this.environmentId}`);
    }

    async getOrganizations() {
        return await this.get<CfArray<CfOrganization>>(`/organizations`);
    }

    async getOrganization(orgId : string) {
        return await this.get<CfOrganization>(`/organizations/${orgId}`);
    }

    queryString(query : any) {
        let queryParts = [];        
        for (let key of Object.keys(query))
            queryParts.push(`${key}=${encodeURIComponent(query[key])}`);

        return `?${queryParts.join('&')}`;
    }

    async fetchAllPublishedEntries() : Promise<CfEntry[]> {
        return await this.getEntireCollection(`/spaces/${this.spaceId}/environments/master/entries`);
    }

    async getEntireCollection<T>(collectionUrl : string) : Promise<T[]> {
        let skip = 0;
        let limit = 1000;
        let total = undefined;
        let items : T[] = [];

        while (true) {
            let page = await this.getFromCollection<T>(collectionUrl, { limit, skip });

            items.push(...page.items);

            skip += page.items.length;

            if (total === undefined) {
                total = page.total;
            }

            if (page.items.length < 1000)
                break;
        }

        return items;
    }

    get baseUrl() {
        return `https://cdn.contentful.com`;
    }
}