import type { SignerPolicy } from '../../../../src/contracts';
import { ArtifactError } from '../archive/error';

export interface SignatureBundle {
  readonly issuer: string;
  readonly subject: string;
  readonly keyId: string;
  readonly signature: string;
}

export function verifySignature(bundle: SignatureBundle, policy: SignerPolicy): void {
  if (policy.required !== true || bundle.issuer !== policy.issuer || bundle.subject !== policy.subject || bundle.keyId !== policy.keyId || bundle.signature.trim() === '') throw new ArtifactError({ code: 'FXE_SIGNER_INVALID', phase: 'verify', message: 'FXE signature signer does not satisfy the locked signer policy', hint: 'Restore an artifact signed by the issuer, subject, and keyId in the artifact lock.', expected: `${policy.issuer}|${policy.subject}|${policy.keyId}`, actual: `${bundle.issuer}|${bundle.subject}|${bundle.keyId}` });
}
