const { setupServer } = require('msw/node');
const { rest } = require('msw');

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

module.exports = { server, rest };
