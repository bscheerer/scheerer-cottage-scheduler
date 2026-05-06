#!/usr/bin/env bash
# Start SES verification for a single email address (sandbox-friendly).
# You must open the inbox and click Amazon's confirmation link.
#
# Usage:
#   export AWS_REGION=us-east-2   # same region as Amplify backend + SES
#   ./scripts/ses-verify-sender.sh scheduler@morben.net
#
# Then check status:
#   aws ses get-identity-verification-attributes \
#     --identities scheduler@morben.net --region "$AWS_REGION"
#
# Request production access (remove recipient limits) is done in the SES console:
#   Account dashboard → Request production access

set -euo pipefail

EMAIL="${1:-}"
REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-2}}"

if [[ -z "$EMAIL" ]]; then
  echo "Usage: AWS_REGION=us-east-2 $0 sender@example.com" >&2
  exit 1
fi

if ! command -v aws &>/dev/null; then
  echo "AWS CLI not found. Install it: https://docs.aws.amazon.com/cli/" >&2
  exit 1
fi

echo "Using region: $REGION"
echo "Requesting verification email for: $EMAIL"
aws ses verify-email-identity --email-address "$EMAIL" --region "$REGION"
echo ""
echo "→ Check that inbox and click the verification link from AWS."
echo "→ Then run:"
echo "   aws ses get-identity-verification-attributes --identities $EMAIL --region $REGION"
echo "   (VerificationStatus should become Success)"
