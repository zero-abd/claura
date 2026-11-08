import paper from 'paper-jsdom';
paper.setup(new paper.Size(256,256));
const a = new paper.Path.Circle({center:[100,100],radius:50});
const b = new paper.Path.Circle({center:[140,100],radius:50});
const u = a.subtract(b);
console.log(u.pathData);
