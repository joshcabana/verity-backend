export function createStripeMock() {
  return {
    checkout: {
      sessions: {
        create: jest.fn(),
      },
    },
    webhooks: {
      constructEvent: jest.fn(),
    },
  };
}

export type StripeMock = ReturnType<typeof createStripeMock>;
