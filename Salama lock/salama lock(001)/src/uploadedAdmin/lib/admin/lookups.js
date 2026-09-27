export function findAgent(agents, agentId) {
  return agents.find((agent) => agent.id === agentId || agent.code === agentId);
}

export function findBike(bikes, bikeId) {
  return bikes.find((bike) => bike.id === bikeId);
}

export function findCustomer(customers, customerId) {
  return customers.find((customer) => customer.id === customerId);
}
