const { Room, Doctor, db } = require('../db/index');
const debug = require('debug')('timify:controllers:resources')
const createAndUpdateResources = async (req, res, next) => {
    
    const updateAllRooms = (rooms) => {
        const bulk = db.rooms.initializeUnorderedBulkOp();
        return rooms.map(room => {
            return bulk.find({ 
                _id: room._id
            }).upsert()
            .replaceOne(item);
        })
        .then(() => {
            return bulk.execute();
        })
    }
    bulk.find( { item: "abc123" } ).upsert().replaceOne(
    {
        item: "abc123",
        status: "P",
        points: 100,
    }
    );
    bulk.execute();
}

const getResources = (req, res, next) => {

}