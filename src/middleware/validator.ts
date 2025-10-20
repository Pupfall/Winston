import { Request, Response, NextFunction } from 'express';

export function validateDomain(req: Request, res: Response, next: NextFunction) {
  const domain = req.params.domain || req.body.domain;

  if (!domain) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Domain is required',
        status: 400,
      },
    });
  }

  // Basic domain validation
  const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
  if (!domainRegex.test(domain)) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Invalid domain format',
        status: 400,
      },
    });
  }

  next();
}

export function validateProvider(req: Request, res: Response, next: NextFunction) {
  const provider = req.query.provider as string;

  if (provider && !['porkbun', 'namecheap'].includes(provider)) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Invalid provider. Supported providers: porkbun, namecheap',
        status: 400,
      },
    });
  }

  next();
}
