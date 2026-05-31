module.exports = function setupSockets(io) {
  io.on('connection', (socket) => {
    console.log(`[Socket] Connected: ${socket.id}`);

    socket.on('join:admin', () => socket.join('admin_room'));

    // Responder pushes their GPS from client side via socket
    socket.on('responder:update_location', (data) => {
      io.emit('responder:location_update', data);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Disconnected: ${socket.id}`);
    });
  });
};
