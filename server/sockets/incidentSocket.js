module.exports = function setupSockets(io) {
  io.on('connection', (socket) => {
    // Join tenant room for scoped notifications
    socket.on('join:barangay', (version) => {
      const v = (version === 'new-visayas' || String(version).includes('visayas')) ? 'new-visayas' : 'manay';
      socket.join(`barangay:${v}`);
    });

    socket.on('join:admin', (data) => {
      const v = typeof data === 'object' && data?.version ? data.version : (typeof data === 'string' ? data : null);
      if (v) {
        const norm = (v === 'new-visayas' || String(v).includes('visayas')) ? 'new-visayas' : 'manay';
        socket.join(`admin_room:${norm}`);
        socket.join(`barangay:${norm}`);
      }
      socket.join('admin_room');
    });

    // Responder pushes their GPS from client side via socket
    socket.on('responder:update_location', (data) => {
      const v = data?.version === 'new-visayas' ? 'new-visayas' : 'manay';
      io.to(`barangay:${v}`).emit('responder:location_update', data);
      io.emit('responder:location_update', data);
    });

    socket.on('disconnect', () => {});
  });
};
