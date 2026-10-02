console.error(`provision:physio-demo-clinic is retired.

River Aftercare uses one shared demo account (slug demodental), not a
separate physiotherapy clinic. This command does not connect to a database
and does not create an account.

Configure the existing demo with:
  pnpm configure:shared-demo
`);
process.exit(1);
