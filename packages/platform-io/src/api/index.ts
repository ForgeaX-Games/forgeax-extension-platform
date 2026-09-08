export interface PlatformIoFailure {
  code: string;
  phase: 'resolve' | 'read' | 'write' | 'delete';
  hint: string;
}

export class PlatformIoError extends Error {
  constructor(readonly failure: PlatformIoFailure) {
    super(`${failure.code} during ${failure.phase}: ${failure.hint}`);
    this.name = 'PlatformIoError';
  }
}

export interface ResourceRequest {
  method: 'GET' | 'PUT' | 'DELETE';
  path: string;
  body?: Uint8Array;
}

export interface ResourceResponse {
  status: number;
  body?: Uint8Array;
  contentType?: string;
  revision?: string;
}

export type ResourceRequester = (request: ResourceRequest) => Promise<ResourceResponse>;

export class ResourceApi {
  constructor(private readonly request: ResourceRequester) {}

  async read(path: string): Promise<ResourceResponse> {
    return this.send({ method: 'GET', path }, 'read');
  }

  async write(path: string, body: Uint8Array): Promise<ResourceResponse> {
    return this.send({ method: 'PUT', path, body }, 'write');
  }

  async remove(path: string): Promise<ResourceResponse> {
    return this.send({ method: 'DELETE', path }, 'delete');
  }

  private async send(request: ResourceRequest, phase: PlatformIoFailure['phase']): Promise<ResourceResponse> {
    const response = await this.request(request);
    if (response.status < 200 || response.status >= 300) {
      throw new PlatformIoError({ code: 'platform-io.request-failed', phase, hint: `Retry ${request.method} ${request.path} after checking the resource permission.` });
    }
    return response;
  }
}
