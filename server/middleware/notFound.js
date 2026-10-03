const notFound = (req, res) => res.status(404).json({ msg: 'Route not found' })

export default notFound
