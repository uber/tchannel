"""TChannel type definitions."""


class Types(object):
    INIT_REQ = 0x01
    INIT_RES = 0x02

    CALL_REQ = 0x03
    CALL_RES = 0x04

    CALL_REQ_CONTINUE = 0x13
    CALL_RES_CONTINUE = 0x14

    CANCEL = 0xc0
    CLAIM = 0xc1

    PING_REQ = 0xd0
    PING_RES = 0xd1

    ERROR = 0xff
