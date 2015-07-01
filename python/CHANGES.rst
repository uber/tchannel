Changelog for tchannel.py
=========================

0.8.6 (unreleased)
------------------

- No changes yet.


0.8.5 (2015-06-30)
------------------

- Add port parameter for `TChannel.listen`.


0.8.4 (2015-06-17)
------------------

- Fix bug where False and False-like values were being treated as None in
  Thrift servers.


0.8.3 (2015-06-15)
------------------

- Add `as` attribute to the response header.


0.8.2 (2015-06-11)
------------------

- Fix callable `traceflag` being propagated to the serializer.
- Fix circular imports.
- Fix `TimeoutError` retry logic.


0.8.1 (2015-06-10)
------------------

- Initial release.
