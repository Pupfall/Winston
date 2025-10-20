import { Router, Request, Response } from 'express';
import { provider } from '../providers';
import { SearchSchema, BuySchema, StatusSchema, validateTlds, validateDomainTld, validateDomainsTlds } from '../lib/schemas';
import { asyncHandler, ValidationError, HttpError, PremiumNotAllowedError, DailyCapExceededError, UnsafeLabelError, UnknownDnsTemplateError } from '../lib/errors';
import { MAX_PER_TXN_USD, MAX_DAILY_USD, getAllowedTlds, ALLOWLIST_TLDS } from '../config';
import { normalizeDomain, getTld, generateCandidates, splitDomain } from '../lib/utils';
import { getPurchase, storePurchase, isDomainPurchased, getDomainPurchase, PurchaseRecord } from '../lib/store';
import { idem, stableDigest } from '../lib/idem';
import { spend } from '../lib/spend';
import { accountKey, getUser } from '../lib/auth';
import { analyzeLabelSafety } from '../lib/homograph';
import { getTemplate } from '../dns/templates';
import { prisma } from '../db/prisma';
import { recordAudit } from '../db/repo';
import { Prisma } from '@prisma/client';

const router = Router();

/**
 * POST /search
 * Check availability for multiple domains
 *
 * Body: { candidates?: string[], prompt?: string, tlds?: string[], price_ceiling?: number, limit?: number }
 * Returns: [{ domain, available, price_usd, premium }]
 */
router.post('/search', asyncHandler(async (req: Request, res: Response) => {
  // Validate request body with Zod
  const input = SearchSchema.parse(req.body);

  // Determine TLDs to use
  let tlds: string[];
  if (input.tlds && input.tlds.length > 0) {
    // Validate provided TLDs against allowlist
    validateTlds(input.tlds);
    tlds = input.tlds;
  } else {
    // Use allowlist TLDs or common defaults
    tlds = ALLOWLIST_TLDS.size > 0
      ? Array.from(ALLOWLIST_TLDS)
      : ['com', 'net', 'org', 'io'];
  }

  // Generate candidate domains
  let domainsToCheck: string[];
  if (input.candidates && input.candidates.length > 0) {
    // Use provided candidates
    domainsToCheck = input.candidates.map(normalizeDomain);
  } else if (input.prompt) {
    // Generate from prompt + TLDs
    domainsToCheck = generateCandidates(input.prompt, tlds);
  } else {
    throw new ValidationError('Either candidates or prompt must be provided');
  }

  // Validate all domain TLDs against allowlist
  validateDomainsTlds(domainsToCheck);

  // Homograph safety: check all domain labels
  const unsafeDomains: { domain: string; reasons: string[] }[] = [];
  const safeDomains: string[] = [];

  for (const domain of domainsToCheck) {
    const { label, tld } = splitDomain(domain);

    // Check label safety (TLD is already validated above)
    const safety = analyzeLabelSafety(label, {
      allowUnicode: input.include_unicode === true,
    });

    if (!safety.safe) {
      unsafeDomains.push({ domain, reasons: safety.reasons });
    } else {
      safeDomains.push(domain);
    }
  }

  // If all domains are unsafe, return error with sample reasons
  if (safeDomains.length === 0 && unsafeDomains.length > 0) {
    const samples = unsafeDomains.slice(0, 2).map(u => ({
      domain: u.domain,
      reasons: u.reasons,
    }));

    throw new UnsafeLabelError(
      'All domain labels failed safety checks',
      {
        unsafe_count: unsafeDomains.length,
        samples,
        hint: 'Use include_unicode:true to allow Unicode domains in punycode format (xn--)',
      }
    );
  }

  // Continue with only safe domains
  domainsToCheck = safeDomains;

  // Check availability via provider
  const results = await provider.checkAvailability(domainsToCheck);

  // Filter results based on search criteria
  let filtered = results;

  // Filter premium domains unless explicitly included
  if (!input.include_premium) {
    filtered = filtered.filter(r => !r.premium);
  }

  // Apply price ceiling filter if provided
  if (input.price_ceiling) {
    filtered = filtered.filter(r => r.price_usd <= input.price_ceiling!);
  }

  // Apply limit
  if (input.limit) {
    filtered = filtered.slice(0, input.limit);
  }

  // Audit log search
  const user = getUser(req);
  if (user) {
    await recordAudit(user.id, 'SEARCH', {
      prompt: input.prompt,
      tlds,
      count: filtered.length,
    });
  }

  res.json(filtered);
}));

/**
 * POST /buy
 * Register a domain
 *
 * Body: { domain, years?, whois_privacy?, dns_template_id?, quoted_total_usd, confirmation_code, idempotency_key }
 * Returns: { order_id, charged_total_usd, registrar }
 */
router.post('/buy', asyncHandler(async (req: Request, res: Response) => {
  // Validate request body with Zod
  const input = BuySchema.parse(req.body);

  // Normalize domain
  const domain = normalizeDomain(input.domain);
  const years = input.years || 1;
  const privacy = input.whois_privacy !== false;
  const allowPremium = input.allow_premium || false;
  const allowUnicode = input.allow_unicode || false;

  // Validate domain TLD against allowlist
  validateDomainTld(domain);

  // Homograph safety: check domain label
  const { label, tld } = splitDomain(domain);
  const safety = analyzeLabelSafety(label, { allowUnicode });

  if (!safety.safe) {
    throw new UnsafeLabelError(
      `Domain label '${label}' failed safety checks`,
      {
        domain,
        label,
        reasons: safety.reasons,
        hint: safety.reasons.includes('NonASCIINotAllowed')
          ? 'Use allow_unicode:true to allow Unicode domains in punycode format (xn--)'
          : 'Domain label contains unsafe characters or formatting',
      }
    );
  }

  // Enforce transaction limit
  if (input.quoted_total_usd > MAX_PER_TXN_USD) {
    throw new HttpError(
      400,
      'SpendCapExceeded',
      {
        message: `Transaction amount $${input.quoted_total_usd} exceeds maximum allowed $${MAX_PER_TXN_USD} per transaction`,
        max_per_txn_usd: MAX_PER_TXN_USD,
        quoted_total_usd: input.quoted_total_usd,
      }
    );
  }

  // Premium domain validation - get fresh quote to check premium status
  const quoted = await provider.quote(domain, years, privacy);
  if (quoted.premium && !allowPremium) {
    throw new PremiumNotAllowedError(
      `Domain '${domain}' is premium and requires allow_premium flag`,
      {
        domain,
        premium: true,
        price_usd: quoted.total_usd,
      }
    );
  }

  // Daily spend cap enforcement
  const acct = accountKey(req);
  const todaySpent = await spend.getTotal(acct);
  if (todaySpent + input.quoted_total_usd > MAX_DAILY_USD) {
    const remaining = Math.max(0, MAX_DAILY_USD - todaySpent);
    throw new DailyCapExceededError(
      `Purchase would exceed daily spending cap of $${MAX_DAILY_USD}`,
      {
        max_daily_usd: MAX_DAILY_USD,
        spent_today: todaySpent,
        remaining,
        requested: input.quoted_total_usd,
      }
    );
  }

  // Build idempotency key and request digest
  const key = `buy:${domain}:${input.idempotency_key}`;
  const digest = stableDigest({
    domain,
    years,
    whois_privacy: privacy,
    quoted_total_usd: input.quoted_total_usd,
  });

  // Check idempotency - return existing response if already processed
  const started = await idem.begin(key);
  if (!started.ok) {
    // Replay path: verify digest matches
    if (started.existing!.digest !== digest) {
      console.log(`[Buy] PRICE_DRIFT: Digest mismatch for ${key}`);
      throw new HttpError(
        409,
        'IdempotencyMismatch',
        {
          message: 'Request parameters differ from original request with same idempotency key',
          original_digest: started.existing!.digest,
          current_digest: digest,
        }
      );
    }

    // Digest matches, return cached response
    return res.json(started.existing!.response);
  }

  // Acquire mutex to prevent concurrent operations with same key
  await idem.acquire(key);

  try {
    // Server-side re-quote for price drift protection
    // Always fetch fresh pricing just before registration
    const serverQuote = await provider.quote(domain, years, privacy);

    // Check price drift (tolerance: $0.50)
    const priceDiff = Math.abs(serverQuote.total_usd - input.quoted_total_usd);
    if (priceDiff > 0.50) {
      console.log(`[Buy] PRICE_DRIFT: ${domain} - Server: $${serverQuote.total_usd}, Client: $${input.quoted_total_usd}, Diff: $${priceDiff}`);
      throw new HttpError(
        409,
        'PriceDrift',
        {
          message: 'Server price differs from quoted price',
          server_price: serverQuote.total_usd,
          client_quoted: input.quoted_total_usd,
          drift: priceDiff,
        }
      );
    }

    // Register domain via provider
    const result = await provider.register({
      domain,
      years,
      privacy,
    });

    if (!result.success) {
      throw new ValidationError(
        result.message || 'Registration failed',
        { domain }
      );
    }

    // DNS Configuration: Apply nameservers or DNS template
    const nameserverMode = input.nameserver_mode || 'registrar';
    let appliedDnsTemplate: string | null = null;

    if (nameserverMode === 'custom' && input.nameservers) {
      // Custom nameserver mode: set user-provided nameservers
      console.log(`[Buy] Setting custom nameservers for ${domain}`);
      await provider.setNameservers(domain, input.nameservers);
      console.log(`[Buy] Custom nameservers set successfully`);
    } else {
      // Registrar mode (default): apply DNS template
      const templateId = input.dns_template_id || 'web-basic';
      const template = getTemplate(templateId);

      if (!template) {
        throw new UnknownDnsTemplateError(
          `DNS template '${templateId}' not found`,
          { template_id: templateId }
        );
      }

      console.log(`[Buy] Applying DNS template '${templateId}' to ${domain}`);
      await provider.applyRecords(domain, template.records);
      appliedDnsTemplate = templateId;
      console.log(`[Buy] DNS template applied successfully`);
    }

    // Get authenticated user
    const user = getUser(req);
    if (!user) {
      throw new HttpError(401, 'Unauthorized', { message: 'Authentication required for domain purchase' });
    }

    // ============================================
    // PERSIST TO DATABASE
    // ============================================

    // 1. Upsert Domain record
    const domainRecord = await prisma.domain.upsert({
      where: { name: domain },
      create: {
        name: domain,
        userId: user.id,
        registrar: 'porkbun',
        status: 'PURCHASED',
        privacy,
        autoRenew: true,
      },
      update: {
        status: 'PURCHASED',
        privacy,
        registrar: 'porkbun',
        updatedAt: new Date(),
      },
    });

    console.log(`[Buy] Domain record upserted: ${domainRecord.id}`);

    // 2. Create Purchase record
    const purchaseRecord = await prisma.purchase.create({
      data: {
        userId: user.id,
        domainId: domainRecord.id,
        registrar: 'porkbun',
        orderId: result.order_id,
        years,
        totalUsd: new Prisma.Decimal(result.charged_total_usd),
        premium: quoted.premium || false,
      },
    });

    console.log(`[Buy] Purchase record created: ${purchaseRecord.id}`);

    // 3. Audit log - success
    await recordAudit(user.id, 'BUY_SUCCESS', {
      domain,
      orderId: result.order_id,
      totalUsd: result.charged_total_usd,
      years,
      privacy,
      premium: quoted.premium,
      nameserverMode,
      dnsTemplateId: appliedDnsTemplate,
    });

    // 4. Update daily spend (already DB-backed via repo)
    await spend.add(acct, result.charged_total_usd);

    // Build response
    const response = {
      order_id: result.order_id,
      charged_total_usd: result.charged_total_usd,
      registrar: 'porkbun',
      nameserver_mode: nameserverMode,
      dns_template_id: appliedDnsTemplate,
      domainId: domainRecord.id,
    };

    // Commit to idempotency store
    await idem.commit(key, { response, digest }, 3600);

    // Also store in legacy store for status queries (for backward compatibility)
    const legacyRecord: PurchaseRecord = {
      ...response,
      domain,
      years,
      privacy,
      timestamp: new Date().toISOString(),
    };
    storePurchase(domain, input.idempotency_key, legacyRecord);

    return res.json(response);
  } catch (error) {
    // Clear idempotency entry on failure
    await idem.fail(key);

    // Audit log - failure
    const user = getUser(req);
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    const errorMessage = error instanceof Error ? error.message : String(error);

    await recordAudit(user?.id || null, 'BUY_FAIL', {
      domain,
      error: errorName,
      message: errorMessage,
      quoted_total_usd: input.quoted_total_usd,
      years,
    });

    throw error;
  } finally {
    // Always release mutex
    idem.release(key);
  }
}));

/**
 * GET /status/:domain
 * Check domain registration status
 *
 * Returns: { domain, state, details }
 */
router.get('/status/:domain', asyncHandler(async (req: Request, res: Response) => {
  // Validate domain parameter with Zod
  const input = StatusSchema.parse({ domain: req.params.domain });

  // Normalize domain
  const domain = normalizeDomain(input.domain);

  // Validate domain TLD against allowlist
  validateDomainTld(domain);

  // Query database for domain record
  const row = await prisma.domain.findUnique({
    where: { name: domain },
  });

  if (!row) {
    // Domain not found in our database
    return res.json({
      domain,
      state: 'unknown',
      details: {
        message: 'Domain not found - not purchased through this system',
      },
    });
  }

  // Map database status enum to API state
  let state: string;
  switch (row.status) {
    case 'PURCHASED':
      state = 'purchased';
      break;
    case 'DNS_APPLIED':
      state = 'dns_applied';
      break;
    case 'ERROR':
      state = 'error';
      break;
    default:
      state = 'unknown';
  }

  res.json({
    domain,
    state,
    details: {
      registrar: row.registrar,
      updatedAt: row.updatedAt.toISOString(),
    },
  });
}));

export default router;
