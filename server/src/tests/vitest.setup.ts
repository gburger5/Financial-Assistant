import dotenv from 'dotenv';

// Ensure NODE_ENV is 'test' before dotenv runs so the logger goes silent and
// gracefulShutdown is skipped. dotenv will not override a variable that is
// already present in the environment, so an explicit NODE_ENV=production in the
// shell still takes precedence.
process.env.NODE_ENV ??= 'test';

dotenv.config();
