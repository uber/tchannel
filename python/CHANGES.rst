Changelog for tchannel.py
=========================

0.8.5 (unreleased)
------------------

- No changes yet.


0.8.4 (2015-06-17)
------------------

- Fix bug where False and False-like values were being treated as None in
  Thrift servers.


0.8.3 (2015-06-15)
------------------

- Added 'as' attr into response header


0.8.2 (2015-06-11)
------------------

- Fixed callable traceflag being propagated to the serializer.
- Fixed circular imports.
- Fixed TimeoutError retry logic.


0.8.1 (2015-06-10)
------------------

- Initial release.
