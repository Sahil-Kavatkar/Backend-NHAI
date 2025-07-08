import express from 'express';
import mongoose from'mongoose';
import highwayRoutes from './routes/highwayRoutes.js';
const app = express();

app.use(express.json());

mongoose.connect('mongodb+srv://sahilkavatkar:AwRJfwGN5u1gYleT@highway.3tlrn4x.mongodb.net/?retryWrites=true&w=majority&appName=highway')
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));


app.use('/api', highwayRoutes);

app.get('/', async(req, res) => {
    res.send({ message: 'Hello, World!' });
});
app.listen(8000 ,()=>{
    console.log('✅ listening on port 8000');
});