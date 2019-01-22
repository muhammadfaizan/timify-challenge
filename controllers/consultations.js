const { Room, Doctor, Consultation } = require('../db/index');
const debug = require('debug')('timify:controllers:consultations')
let m = require('moment');
const { extendMoment } = require('moment-range');
const mongoose = require('mongoose');
const v = require('../services/index').validator;
const R = require('ramda');
const { TIME_FORMAT, DATE_FORMAT, DATE_TIME_FORMAT } = require('../services').constants;
const RK = mongoose.Types.ObjectId;
const moment = m.utc
m = extendMoment(m);

/**
 * @description It converts weekday of moment number into the number weekday index in our DB
 * @param {Number} momentIndex 
 * @returns {Number}
 */
const cvrtMoment2Index = (momentIndex) => (momentIndex) % 7;

/**
 * 
 * @param {Object} referenceTime 
 * @param {Date} referenceTime.begin 
 * @param {Date} referenceTime.end
 * @param {Object} subjectTime 
 * @param {Date} subjectTime.begin
 * @param {Date} subjectTime.end
 */
const findMiddleTime = (referenceTime, subjectTime) => {

    if (!referenceTime || !subjectTime) {
        // debug('null case');
        return null;
    }
    // case 8
    if (moment(subjectTime.begin).isSameOrAfter(referenceTime.end) ||
        moment(subjectTime.end).isSameOrBefore(referenceTime.begin)) {
        // debug('case 8');
        return null
    }
    // case 2 & case 1
    if (moment(referenceTime.begin).isSameOrBefore(subjectTime.begin) &&
        moment(referenceTime.end).isSameOrAfter(subjectTime.end)) {
        // debug('case 1 & 2')
        return {
            begin: new Date(subjectTime.begin),
            end: new Date(subjectTime.end)
        };
    }
    // case 3 & 9
    if (moment(referenceTime.begin).isSame(subjectTime.begin)) {
        // debug('case 3 & 9')
        return {
            begin: new Date(referenceTime.begin),
            end: (moment(referenceTime.end).isSameOrBefore(subjectTime.end)) ? new Date(referenceTime.end) : new Date(subjectTime.end)
        }
    }
    // case 4 and 10
    if (moment(referenceTime.end).isSame(subjectTime.end)) {
        // debug('case 4 & 10');
        return {
            begin: (moment(referenceTime.begin).isAfter(subjectTime.begin)) ? new Date(referenceTime.begin) : new Date(subjectTime.begin),
            end: new Date(referenceTime.end),
        }
    }

    // case 6
    if (moment(subjectTime.begin).isBetween(referenceTime.begin, referenceTime.end)) {
        // debug('case 6')
        return {
            begin: new Date(subjectTime.begin),
            end: (moment(referenceTime.end).isSameOrBefore(subjectTime.end)) ? new Date(referenceTime.end) : new Date(subjectTime.end)
        }
    }
    // case 7
    if (moment(subjectTime.end).isBetween(referenceTime.begin, referenceTime.end)) {
        // debug('case 7')
        return {
            begin: (moment(referenceTime.begin).isAfter(subjectTime.begin)) ? new Date(referenceTime.begin) : new Date(subjectTime.begin),
            end: new Date(subjectTime.end)
        }
    }
    // debug('no case');
    return null;
}

/**
 * 
 * @param {Object} time 
 * @param {Date} time.begin
 * @param {Date} time.end
 * @param {Object[]} consultations 
 * @param {Date} consultations[].begin
 * @param {Date} consultations[].end
 * @param {Number} durationInMins 
 */
const timeSeparator = (time, consultations, durationInMins) => {
    let timeRanges = [m.range(time.begin, time.end)];
    consultations.forEach(con => {
        timeRanges.forEach((t, i) => {
            let ranges = t.subtract(m.range(con.begin, con.end));
            if (ranges[0] !== null) {
                timeRanges.splice(i, 1, ...ranges)
            }
        })
    })
    return timeRanges.reduce((prev, t) => {
        if (moment(t.end).diff(t.start, 'minute') >= durationInMins) {
            prev.push({
                begin: t.start.utc().toDate(),
                end: t.end.subtract(durationInMins, 'minute').utc().toDate()
            });
        }
        return prev;
    }, [])
}
/**
 * 
 * @param {Object[]} docSet 
 * @param {Object[]} docSet[].times
 * @param {Date} docSet[].times[].begin
 * @param {Date} docSet[].times[].end
 * @param {MomentObject} mStartDate 
 * @param {MomentObject} mEndDate 
 */
const setAvailableTime = (docSet, mStartDate, mEndDate) => {
    return docSet.map(doc => {
        if (!doc.availableTimes) {
            doc.availableTimes = [];
        }
        let docItrtvDate = mStartDate.clone();
        // iterating over days to create exact same days for each day in interval
        while (docItrtvDate <= mEndDate) {

            let dayIndex = cvrtMoment2Index(docItrtvDate.weekday());

            if (!doc.times[dayIndex]) {
                doc.availableTimes.push(null);
            } else {
                let begin = moment(`${docItrtvDate.format(DATE_FORMAT)} ${doc.times[dayIndex].begin}`, DATE_TIME_FORMAT).toDate();
                let end = moment(`${docItrtvDate.format(DATE_FORMAT)} ${doc.times[dayIndex].end}`, DATE_TIME_FORMAT).toDate();
                if (mStartDate.isSameOrAfter(end)) {
                    doc.availableTimes.push(null);
                } else if (mEndDate.isSameOrBefore(end)) {
                    doc.availableTimes.push(null);
                } else if (mStartDate.isAfter(begin)) {
                    begin = mStartDate.toDate();
                } else if (mEndDate.isBefore(end)) {
                    end = mEndDate.toDate();
                } else {
                    doc.availableTimes.push({
                        begin,
                        end
                    })
                }
            }
            docItrtvDate.add(1, 'day');
        }
        return doc;
    });
}

const findAvailabilityWithQuery = async (req, res, next) => {
    try {
        let payload = req.query;
        payload.duration = parseInt(payload.duration)
        let mStartDate = moment(payload.begin, DATE_TIME_FORMAT)
        let mEndDate = moment(payload.end, DATE_TIME_FORMAT)
        let daysCount = Math.ceil(mEndDate.diff(mStartDate, 'days'));
        if (mStartDate > mEndDate) {
            throw new Error('"begin" date must be earlier date than "end" date')
        }
        let weekDays = [];
        for (let i = 0, iterativeDate = mStartDate.clone();
            i < 7 && iterativeDate < mEndDate;
            i++) {
            weekDays.push(cvrtMoment2Index(iterativeDate.weekday()))
            iterativeDate.add(1, 'day');
        }
        if (weekDays.length < 7 && mEndDate.isAfter(mEndDate.clone().startOf('day'))) {
            weekDays.push(cvrtMoment2Index(mEndDate.weekday()))
        }
        const arrayOfTermBuilder = (term, repeatCount) => {
            let arrOfTerm = []
            for (let index = 0; index < repeatCount; index++) {
                arrOfTerm.push(term);
            }
            return arrOfTerm;
        }
        let concatTimes = {
            $addFields: {
                availableTimes: { $concatArrays: arrayOfTermBuilder('$times', Math.ceil(daysCount / 7)) }
            }
        }
        let pipelineForDnR = (foreignField) => [
            {
                $match: {
                    $or: weekDays.map(wd => {
                        let key = `times.${wd}`;
                        let q = {};
                        q[key] = { $ne: { $type: 10 } }
                        return q;
                    })
                }
            },
            concatTimes,
            {
                $project:
                {
                    times: 0
                }
            },
            {
                $unwind: {
                    path: "$availableTimes",
                    includeArrayIndex: "timeIndex",
                    preserveNullAndEmptyArrays: false
                }
            },
            {
                $match: {
                    availableTimes: { $ne: null }
                }
            },
            /* not available in mongod v3.6
            {
                $addFields: {
                    begin: { $toDate: { $concat: [mStartDate.format('YYYY-MM-DD '), "$availableTimes.begin"] } },
                    end: { $toDate: { $concat: [mStartDate.format('YYYY-MM-DD '), "$availableTimes.end"] } }
                }
            },
            */
            {
                $addFields: {
                    begin: { 
                        $dateFromString: {
                            dateString: { 
                                $concat: [mStartDate.format('YYYY-MM-DD '), "$availableTimes.begin"] 
                            }
                        } 
                    },
                    end: { 
                        $dateFromString: {
                            dateString: { 
                                $concat: [mStartDate.format('YYYY-MM-DD '), "$availableTimes.end"] 
                            }
                        } 
                    }
                }
            },
            {
                $project: {
                    id: 1,
                    name: 1,
                    timeIndex: 1,
                    begin: { $add: ["$begin", { $multiply: ['$timeIndex', 24, 60, 60000] }] },
                    end: { $add: ["$end", { $multiply: ['$timeIndex', 24, 60, 60000] }] }
                }
            },
            {
                $match: {
                    $and: [
                        {
                            end: { $gt: mStartDate.toDate() },
                        },
                        {
                            begin: { $lt: mEndDate.toDate() },
                        }
                    ]
                }
            },
            {
                $project: {
                    id: 1,
                    name: 1,
                    timeIndex: 1,
                    begin: {
                        $cond: [
                            { $lt: ["$begin", mStartDate.toDate()] },
                            mStartDate.toDate(),
                            "$begin"
                        ]
                    },
                    end: {
                        $cond: [
                            { $gt: ["$end", mEndDate.toDate()] },
                            mEndDate.toDate(),
                            "$end"
                        ]
                    },
                }
            },
            {
                $lookup:
                {
                    from: "consultations",
                    localField: "id",
                    foreignField: foreignField,
                    as: "consultations"
                }
            },
            {
                $project: {
                    name: 1,
                    id: 1,
                    begin: 1,
                    timeIndex: 1,
                    end: 1,
                    consultations: {
                        $filter: {
                            input: "$consultations",
                            as: "consultation",
                            cond: {
                                $and: [
                                    { $gte: ["$$consultation.begin", "$begin"] },
                                    { $lte: ["$$consultation.end", "$end"] },
                                ]
                            }
                        }
                    }
                }
            },
            {
                $group: {
                    _id: "$id",
                    times: { "$push": { begin: "$begin", end: "$end", dayIndex:'$timeIndex', consultations: "$consultations" } }
                },
            },
            {
                $project: {
                    _id: 1,
                    times: 1,
                    timesObj: { 
                        $map:
                            {
                                input: "$times",
                                as: "time",
                                in: [{
                                    $substr: [ "$$time.dayIndex", 0, 2 ],
                                },
                                {
                                    "begin": "$$time.begin",
                                    "end": "$$time.end",
                                    "consultations": "$$time.consultations"
                                }]
                            }
                    }
                },
            },
            {
                $project: {
                    _id: 1,
                    times: { 
                        $arrayToObject: "$timesObj"
                    }
                },
            }
        ]
        let availableDoctors = await Doctor.aggregate(pipelineForDnR("doctorId"));
        let availableRooms = await Room.aggregate(pipelineForDnR("roomId"));
        let availableDnR = [];
        availableDoctors.forEach(doctor => {
            availableRooms.forEach(room => {
                let DnR = {
                    room: room._id,
                    doctor: doctor._id,
                    times: []
                };
                for (let index = 0; index < daysCount; index++) {
                    let doctorSpan = doctor.times[index];
                    let roomSpan = room.times[index];
                    if (!doctorSpan || !roomSpan ) {
                        continue;
                    }
                    const roomTimeSpan = m.range(roomSpan.begin, roomSpan.end);
                    const doctorTimeSpan = m.range(doctorSpan.begin, doctorSpan.end);
                    const intersectionSpan = roomTimeSpan.intersect(doctorTimeSpan);
                    if (!intersectionSpan) {
                        continue;
                    }
                    let timeRanges = [intersectionSpan];
                    doctorSpan.consultations.forEach(con => {
                        timeRanges.forEach((t, i) => {
                            let ranges = t.subtract(m.range(con.begin, con.end));
                            if (ranges[0] !== null) {
                                ranges = ranges.filter(range => range.diff('minutes') >= payload.duration)
                                timeRanges.splice(i, 1, ...ranges)
                            }
                        })
                    })
                    roomSpan.consultations.forEach(con => {
                        timeRanges.forEach((t, i) => {
                            let ranges = t.subtract(m.range(con.begin, con.end));
                            if (ranges[0] !== null) {
                                ranges = ranges.filter(range => range.diff('minutes') >= payload.duration)
                                timeRanges.splice(i, 1, ...ranges)
                            }
                        })
                    })
                    DnR.times = timeRanges.map(({start,end}) => Object.assign({begin: start, end}))
                    availableDnR = availableDnR.concat(DnR.times.map(t => {
                        return {
                            begin: t.begin,
                            end: moment(t.end).subtract(payload.duration, 'minutes')
                        }
                    }))
                    
                }
            })
        })

        res.send(R.uniq(availableDnR))
    } catch (err) {
        next(err);

    }
}

const findAvailability = async (req, res, next) => {
    try {
        const validator = v.object({
            begin: v.dateTimeString,
            end: v.dateTimeString,
            duration: v.numeric
        });

        // debug(req.query);
        validator(req.query);
        let payload = req.query;
        payload.duration = parseInt(payload.duration)
        let mStartDate = moment(payload.begin, DATE_TIME_FORMAT)
        let mEndDate = moment(payload.end, DATE_TIME_FORMAT)
        if (mStartDate > mEndDate) {
            throw new Error('"begin" date must be earlier date than "end" date')
        }
        let weekDays = [];
        for (let i = 0, iterativeDate = mStartDate.clone();
            i < 7 && iterativeDate < mEndDate;
            i++) {
            weekDays.push(cvrtMoment2Index(iterativeDate.weekday()))
            iterativeDate.add(1, 'day');
        }
        if (weekDays.length < 7 && mEndDate.isAfter(mEndDate.clone().startOf('day'))) {
            weekDays.push(cvrtMoment2Index(mEndDate.weekday()))
        }

        /* 
         To check null value
         { $type: 10 }
        */
        let query = {
            $or: weekDays.map(wd => {
                let key = `times.${wd}`;
                let q = {};
                q[key] = { $ne: { $type: 10 } }
                return q;
            })
        }
        // all the weekdays found
        // now mapping it to query
        // by $or
        let availableRooms = await Room.find(query);
        let availableDoctors = await Doctor.find(query);
        availableDoctors = availableDoctors.map(obj => obj.toObject())
        availableRooms = availableRooms.map(o => o.toObject());

        availableDoctors = setAvailableTime(availableDoctors, mStartDate, mEndDate);
        availableRooms = setAvailableTime(availableRooms, mStartDate, mEndDate);
        let doctorAndRoomTimes = availableRooms.reduce((prev, currentRoom) => {
            return prev.concat(availableDoctors.reduce((prevDoctor, doctor) => {
                let DnR = {
                    room: currentRoom.id,
                    doctor: doctor.id,
                    times: []
                };
                doctor.availableTimes.forEach(doctorTime => {
                    currentRoom.availableTimes.forEach(roomTime => {
                        let commonTimeSpan = findMiddleTime(roomTime, doctorTime);
                        if (commonTimeSpan) {
                            DnR.times.push(commonTimeSpan);
                        }
                    });
                });
                if (DnR.times.length) {
                    return prevDoctor.concat(DnR);
                }
                return prevDoctor;
            }, []))
        }, []);
        debug(doctorAndRoomTimes);
        availableDoctors = null;
        availableRooms = null;
        // once data is ready and has all available time listed for doctor and room.
        // check for consultations on that day and modify that day room accordingly.
        console.time('DnRCalculation')
        doctorAndRoomTimes = await Promise.all(doctorAndRoomTimes.map(async (DnR, i) => {
            let consultationQueries = [];
            // debug(DnR);
            try {
                DnR.times.forEach(time => {
                    consultationQueries.push({
                        $and: [
                            {
                                $or: [
                                    { doctorId: DnR.doctor },
                                    { roomId: DnR.room }
                                ]
                            }, {
                                $or: [
                                    {
                                        $and: [
                                            { begin: { $gte: time.begin } },
                                            { begin: { $lt: time.end } },
                                        ],
                                    }, {
                                        $and: [
                                            {
                                                $or: [
                                                    { doctor: DnR.doctor },
                                                    { room: DnR.room }
                                                ]
                                            },
                                            { end: { $gt: time.begin } },
                                            { end: { $lte: time.end } },
                                        ],
                                    }, {
                                        $or: [
                                            { doctor: DnR.doctor },
                                            { room: DnR.room }
                                        ],
                                        begin: time.startTime,
                                        end: time.endTime,
                                    }, {
                                        $or: [
                                            { doctor: DnR.doctor },
                                            { room: DnR.room }
                                        ],
                                        begin: { $lt: time.begin },
                                        end: { $gt: time.end },
                                    }
                                ],
                            }
                        ],

                    })
                })
            } catch (err) {
                // debug(err);
            }
            console.log('promise' + i)
            console.time('promise' + i);
            // Here I have applied 3 different ways to populate data and found uncommented section to be most fast
            // I am leaving other code too for the reference that it could be done this way too..
            // DnR.consultations = await Promise.all(consultationQueries.map(q => Consultation.find(q, 'begin end')))
            // /*
            DnR.consultations = [];
            for (let i = 0; i < consultationQueries.length; i++) {
                const query = consultationQueries[i];
                DnR.consultations.push(await Consultation.find(query, 'begin end'))
            }
            // */
            /*
            let tasks = consultationQueries.map(q => Consultation.find.bind(Consultation, q, 'begin end'));
            let promise = Promise.resolve();
            DnR.consultations = [];
            tasks.forEach(task => {
                promise = promise.then((consultations) => {
                    if (consultations) {
                        DnR.consultations.push(consultations);
                    }
                    return task();
                });
            });
            DnR.consultations.push(await promise);
            */

            console.timeEnd('promise' + i);
            return DnR;
        }));
        console.timeEnd('DnRCalculation')

        let finalTime = [];

        doctorAndRoomTimes.forEach(DnR => {
            //debug(DnR);
            DnR.times.forEach((avbTime, i) => {
                finalTime.push(timeSeparator(avbTime, DnR.consultations[i], payload.duration));
            });
        })
        // now everytime has a consultation array.

        res.send({
            doctorAndRoomTimes,
            // availableDoctors,
            // availableRooms,
            times: R.flatten(finalTime)
        });
    } catch (err) {
        next(err);
    }
}

const createConsultation = async (req, res, next) => {
    try {
        let payload = [].concat(req.body);
        payload = payload.map(c => {
            c.begin = moment(c.begin, DATE_TIME_FORMAT).toDate();
            c.end = moment(c.end, DATE_TIME_FORMAT).toDate();
            return new Consultation(c);
        })
        await Consultation.remove({});

        let r = await Promise.all(payload.map(d => d.save()))
        // Consultation.collection.insertMany(payload);
        res.send(r);
    } catch (err) {
        next(err);
    }

}
const getAllConsultations = async (req, res, next) => {
    try {
        res.send(await Consultation.find({}));
    } catch (err) {
        next(err);
    }
}

module.exports = {
    findAvailability,
    findAvailabilityWithQuery,
    createConsultation,
    getAllConsultations
}