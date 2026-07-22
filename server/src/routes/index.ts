import { Router } from 'express';
import { healthRouter } from './health';
import { clientsRouter } from '../modules/clients/clients.routes';
import { profilesRouter } from '../modules/profiles/profiles.routes';
import { rateMatrixRouter } from '../modules/rate-matrix/rate-matrix.routes';
import { settingsRouter } from '../modules/settings/settings.routes';
import { notificationsRouter } from '../modules/notifications/notifications.routes';
import { enquiriesRouter } from '../modules/enquiries/enquiries.routes';
import { quotationsRouter } from '../modules/quotations/quotations.routes';
import { paymentsRouter } from '../modules/payments/payments.routes';
import { followUpsRouter } from '../modules/follow-ups/follow-ups.routes';
import { jobCompletionRouter } from '../modules/job-completion/job-completion.routes';
import { communicationsRouter } from '../modules/communications/communications.routes';
import { mobilisationRouter } from '../modules/mobilisation/mobilisation.routes';
import { siteVisitsRouter } from '../modules/site-visits/site-visits.routes';
import { dashboardRouter } from '../modules/dashboard/dashboard.routes';
import { accountsRouter } from '../modules/accounts/accounts.routes';
import { integrationsRouter } from '../modules/integrations/integrations.routes';
import { storageRouter } from '../modules/storage/storage.routes';
import { teamRouter } from '../modules/team/team.routes';
import { cronRouter } from '../modules/cron/cron.routes';
import { publicRouter } from '../modules/public/public.routes';
import { intakeTokensRouter } from '../modules/intake-tokens/intake-tokens.routes';
import { adminRouter } from '../modules/admin/admin.routes';
import { cityRatesRouter } from '../modules/city-rates/city-rates.routes';

/**
 * Root API router. Domain routers are mounted here as they are implemented.
 * Public (token-based, anon) routers will live under /public/*; everything else
 * sits behind the `authenticate` gate applied within each domain router.
 */
export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/clients', clientsRouter);
apiRouter.use('/intake-tokens', intakeTokensRouter);
apiRouter.use('/profiles', profilesRouter);
apiRouter.use('/rate-matrix', rateMatrixRouter);
apiRouter.use('/city-rates', cityRatesRouter);
apiRouter.use('/settings', settingsRouter);
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use('/enquiries', enquiriesRouter);
apiRouter.use('/quotations', quotationsRouter);
apiRouter.use('/payments', paymentsRouter);
apiRouter.use('/follow-ups', followUpsRouter);
apiRouter.use('/job-completion', jobCompletionRouter);
apiRouter.use('/communications', communicationsRouter);
apiRouter.use('/mobilisation', mobilisationRouter);
apiRouter.use('/site-visits', siteVisitsRouter);
apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/accounts', accountsRouter);
apiRouter.use('/integrations', integrationsRouter);
apiRouter.use('/storage', storageRouter);
apiRouter.use('/team', teamRouter);
apiRouter.use('/cron', cronRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use('/public', publicRouter);
//   apiRouter.use('/quotations', quotationsRouter);
//   apiRouter.use('/payments', paymentsRouter);
//   apiRouter.use('/follow-ups', followUpsRouter);
//   apiRouter.use('/job-completion', jobCompletionRouter);
//   apiRouter.use('/communications', communicationsRouter);
//   apiRouter.use('/mobilisation', mobilisationRouter);
//   apiRouter.use('/site-visits', siteVisitsRouter);
//   apiRouter.use('/notifications', notificationsRouter);
//   apiRouter.use('/settings', settingsRouter);
//   apiRouter.use('/team', teamRouter);
//   apiRouter.use('/dashboard', dashboardRouter);
//   apiRouter.use('/accounts', accountsRouter);
//   apiRouter.use('/storage', storageRouter);
//   apiRouter.use('/integrations', integrationsRouter);
//   apiRouter.use('/cron', cronRouter);
//   apiRouter.use('/public', publicRouter);
