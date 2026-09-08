export interface PermissionRequest {
  readonly extensionId: string;
  readonly permissions: readonly string[];
}

export interface PermissionPolicy {
  request(request: PermissionRequest): Promise<boolean>;
}

export function createPermissionPolicy(options: { readonly granted?: readonly string[] } = {}): PermissionPolicy {
  const granted = new Set(options.granted ?? []);
  return {
    async request(request) {
      return request.permissions.every((permission) => granted.has(permission));
    },
  };
}
